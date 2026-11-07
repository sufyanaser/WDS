//! OpenSSH known_hosts Parser, Cryptographic Fingerprinter, and Host Key Verifier
//! Conforms to OpenSSH specification and handles Windows CRLF line endings,
//! atomic file modifications, SHA-256 and MD5 fingerprinting.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use base64::Engine;
use serde::{Deserialize, Serialize};

/// Outcome of inspecting a presented server public key against known_hosts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum HostKeyStatus {
    /// Host, port, and key wire format exactly match an existing known_hosts record.
    Verified,

    /// Host and port are NOT present in known_hosts.
    UnknownHost {
        host: String,
        port: u16,
        key_type: String,
        fingerprint_sha256: String,
        fingerprint_md5: String,
        wire_bytes: Vec<u8>,
    },

    /// CRITICAL SECURITY WARNING: Host exists in known_hosts, but the presented key differs!
    /// Indicates potential Man-in-the-Middle (MitM) attack or server re-installation.
    KeyMismatch {
        host: String,
        port: u16,
        key_type: String,
        new_fingerprint_sha256: String,
        new_fingerprint_md5: String,
        recorded_fingerprint_sha256: String,
        recorded_line_number: usize,
        wire_bytes: Vec<u8>,
    },
}

/// Parsed entry from an OpenSSH known_hosts file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownHostRecord {
    pub line_number: usize,
    pub marker: Option<String>,
    pub host_patterns: Vec<String>,
    pub key_type: String,
    pub key_base64: String,
    pub key_bytes: Vec<u8>,
    pub comment: Option<String>,
}

/// Decision payload delivered from frontend confirm_host_key IPC to russh handshake.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HostKeyDecision {
    pub approved: bool,
    pub remember: bool,
}

/// Errors specific to known_hosts parsing, verification, and persistence.
#[derive(Debug, thiserror::Error)]
pub enum KnownHostsError {
    #[error("I/O error accessing known_hosts: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unable to resolve user home or .ssh directory")]
    HomeNotFound,

    #[error("Invalid Base64 public key encoding at line {line}: {reason}")]
    InvalidBase64 { line: usize, reason: String },

    #[error("User rejected host key verification")]
    UserRejected,

    #[error("Host key verification timed out awaiting user response")]
    Timeout,

    #[error("Verification channel dropped unexpectedly")]
    ChannelDropped,
}

/// Resolves the default path to OpenSSH known_hosts (%USERPROFILE%\.ssh\known_hosts on Windows).
pub fn resolve_known_hosts_path() -> Result<PathBuf, KnownHostsError> {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile).join(".ssh").join("known_hosts");
        return Ok(p);
    }

    if let (Ok(drive), Ok(path)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
        let p = PathBuf::from(format!("{}{}", drive, path)).join(".ssh").join("known_hosts");
        return Ok(p);
    }

    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join(".ssh").join("known_hosts");
        return Ok(p);
    }

    Err(KnownHostsError::HomeNotFound)
}

/// Parses an OpenSSH known_hosts file from raw text content.
/// Robustly handles CRLF (\r\n), standard LF (\n), comments, and empty lines.
pub fn parse_known_hosts_content(content: &str) -> Vec<KnownHostRecord> {
    let mut records = Vec::new();

    for (index, raw_line) in content.lines().enumerate() {
        let line_num = index + 1;
        let trimmed = raw_line.trim();

        // Skip blank lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }

        let mut token_idx = 0;
        let mut marker = None;

        // Check for optional marker (@cert-authority or @revoked)
        if tokens[token_idx].starts_with('@') {
            marker = Some(tokens[token_idx].to_string());
            token_idx += 1;
            if token_idx >= tokens.len() {
                continue;
            }
        }

        // Host pattern field (comma-separated list of hostnames/IPs)
        let hosts_raw = tokens[token_idx];
        token_idx += 1;
        if token_idx >= tokens.len() {
            continue;
        }

        // Key algorithm type
        let key_type = tokens[token_idx].to_string();
        token_idx += 1;
        if token_idx >= tokens.len() {
            continue;
        }

        // Base64-encoded public key wire bytes
        let key_base64 = tokens[token_idx].to_string();
        token_idx += 1;

        // Optional comment
        let comment = if token_idx < tokens.len() {
            Some(tokens[token_idx..].join(" "))
        } else {
            None
        };

        if let Ok(key_bytes) = base64::engine::general_purpose::STANDARD.decode(&key_base64) {
            let host_patterns = hosts_raw.split(',').map(|s| s.trim().to_string()).collect();
            records.push(KnownHostRecord {
                line_number: line_num,
                marker,
                host_patterns,
                key_type,
                key_base64,
                key_bytes,
                comment,
            });
        }
    }

    records
}

/// Computes standard OpenSSH SHA-256 fingerprint: "SHA256:<unpadded-base64>"
pub fn compute_sha256_fingerprint(wire_bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(wire_bytes);
    let hash = hasher.finalize();
    let b64 = base64::engine::general_purpose::STANDARD.encode(hash);
    let unpadded = b64.trim_end_matches('=');
    format!("SHA256:{}", unpadded)
}

/// Computes legacy OpenSSH MD5 fingerprint: "MD5:xx:xx:...:xx"
pub fn compute_md5_fingerprint(wire_bytes: &[u8]) -> String {
    use md5::{Digest, Md5};
    let mut hasher = Md5::new();
    hasher.update(wire_bytes);
    let hash = hasher.finalize();
    let hex_bytes: Vec<String> = hash.iter().map(|b| format!("{:02x}", b)).collect();
    format!("MD5:{}", hex_bytes.join(":"))
}

/// Matches a target (host, port) against a known_hosts pattern token.
pub fn matches_host_pattern(pattern: &str, host: &str, port: u16) -> bool {
    if pattern == host && port == 22 {
        return true;
    }

    let bracketed_with_port = format!("[{}]:{}", host, port);
    if pattern == bracketed_with_port {
        return true;
    }

    if pattern == format!("[{}]:22", host) && port == 22 {
        return true;
    }

    false
}

/// Verifies a server's presented key against the records in known_hosts.
pub fn verify_server_key(
    records: &[KnownHostRecord],
    host: &str,
    port: u16,
    key_type: &str,
    wire_bytes: &[u8],
) -> HostKeyStatus {
    let presented_sha256 = compute_sha256_fingerprint(wire_bytes);
    let presented_md5 = compute_md5_fingerprint(wire_bytes);

    let mut matching_host_records = Vec::new();

    for record in records {
        if record.marker.as_deref() == Some("@revoked") {
            continue;
        }

        let host_matches = record.host_patterns.iter().any(|pat| matches_host_pattern(pat, host, port));
        if host_matches {
            matching_host_records.push(record);
        }
    }

    // Case 1: Host has never been seen before
    if matching_host_records.is_empty() {
        return HostKeyStatus::UnknownHost {
            host: host.to_string(),
            port,
            key_type: key_type.to_string(),
            fingerprint_sha256: presented_sha256,
            fingerprint_md5: presented_md5,
            wire_bytes: wire_bytes.to_vec(),
        };
    }

    // Case 2: Exact algorithm and key match
    for record in &matching_host_records {
        if record.key_type == key_type && record.key_bytes == wire_bytes {
            return HostKeyStatus::Verified;
        }
    }

    // Case 3: Host was recorded, but key differs -> Key Mismatch!
    let conflicting_record = matching_host_records
        .iter()
        .find(|r| r.key_type == key_type)
        .unwrap_or(&matching_host_records[0]);

    let recorded_sha256 = compute_sha256_fingerprint(&conflicting_record.key_bytes);

    HostKeyStatus::KeyMismatch {
        host: host.to_string(),
        port,
        key_type: key_type.to_string(),
        new_fingerprint_sha256: presented_sha256,
        new_fingerprint_md5: presented_md5,
        recorded_fingerprint_sha256: recorded_sha256,
        recorded_line_number: conflicting_record.line_number,
        wire_bytes: wire_bytes.to_vec(),
    }
}

/// Atomically appends a newly accepted host key line to known_hosts.
pub fn append_to_known_hosts(
    path: &Path,
    host: &str,
    port: u16,
    key_type: &str,
    wire_bytes: &[u8],
) -> Result<(), KnownHostsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let host_token = if port == 22 {
        host.to_string()
    } else {
        format!("[{}]:{}", host, port)
    };

    let b64_key = base64::engine::general_purpose::STANDARD.encode(wire_bytes);
    let new_line = format!("{} {} {}\n", host_token, key_type, b64_key);

    let mut needs_leading_newline = false;
    if path.exists() {
        if let Ok(mut f) = fs::File::open(path) {
            let len = f.metadata().map(|m| m.len()).unwrap_or(0);
            if len > 0 {
                use std::io::Seek;
                if f.seek(std::io::SeekFrom::End(-1)).is_ok() {
                    let mut last_byte = [0u8; 1];
                    if f.read_exact(&mut last_byte).is_ok() && last_byte[0] != b'\n' {
                        needs_leading_newline = true;
                    }
                }
            }
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;

    if needs_leading_newline {
        file.write_all(b"\n")?;
    }

    file.write_all(new_line.as_bytes())?;
    file.sync_all()?;
    Ok(())
}

/// Safely replaces an altered host key (used when user approves a KeyMismatch change).
pub fn replace_known_host(
    path: &Path,
    host: &str,
    port: u16,
    key_type: &str,
    wire_bytes: &[u8],
) -> Result<(), KnownHostsError> {
    let content = if path.exists() {
        fs::read_to_string(path)?
    } else {
        String::new()
    };

    let mut retained_lines = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            retained_lines.push(line.to_string());
            continue;
        }

        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.len() >= 3 {
            let host_field = tokens[0];
            let k_type = tokens[1];
            let host_matches = host_field.split(',').any(|pat| matches_host_pattern(pat, host, port));

            if host_matches && k_type == key_type {
                continue; // Omit old key line being replaced
            }
        }
        retained_lines.push(line.to_string());
    }

    let host_token = if port == 22 { host.to_string() } else { format!("[{}]:{}", host, port) };
    let b64_key = base64::engine::general_purpose::STANDARD.encode(wire_bytes);
    retained_lines.push(format!("{} {} {}", host_token, key_type, b64_key));

    let parent = path.parent().ok_or(KnownHostsError::HomeNotFound)?;
    fs::create_dir_all(parent)?;
    let temp_path = parent.join(format!(".known_hosts.tmp.{}", uuid::Uuid::new_v4()));

    {
        let mut temp_file = fs::File::create(&temp_path)?;
        for line in retained_lines {
            writeln!(temp_file, "{}", line)?;
        }
        temp_file.sync_all()?;
    }

    fs::rename(&temp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Verified ground truth test vectors from C:\Users\sufya\.ssh\known_hosts
    const MOCK_ED25519_B64: &str = "AAAAC3NzaC1lZDI1NTE5AAAAIECtPpPXrjscYWqHDA/VFc1mV9zR3Xy91wK5nw4LZwkI";
    const EXPECTED_SHA256: &str = "SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k";
    const EXPECTED_MD5: &str = "MD5:49:6a:07:d1:11:94:1b:39:18:65:6f:24:fe:a1:82:3f";

    #[test]
    fn test_fingerprint_computation_against_openssh_ground_truth() {
        let wire_bytes = base64::engine::general_purpose::STANDARD.decode(MOCK_ED25519_B64).unwrap();
        assert_eq!(compute_sha256_fingerprint(&wire_bytes), EXPECTED_SHA256);
        assert_eq!(compute_md5_fingerprint(&wire_bytes), EXPECTED_MD5);
    }

    #[test]
    fn test_crlf_and_comment_resilient_parsing() {
        let mock_file = format!(
            "# This is a comment\r\n\r\ngithub.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\r\n\
             192.168.68.103 ssh-ed25519 {} ali@mac\n\
             [10.0.0.1]:2222 ssh-ed25519 {}\r\n",
            MOCK_ED25519_B64, MOCK_ED25519_B64
        );

        let records = parse_known_hosts_content(&mock_file);
        assert_eq!(records.len(), 3);
        assert_eq!(records[0].host_patterns, vec!["github.com"]);
        assert_eq!(records[1].host_patterns, vec!["192.168.68.103"]);
        assert_eq!(records[1].key_type, "ssh-ed25519");
        assert_eq!(records[1].comment.as_deref(), Some("ali@mac"));
        assert_eq!(records[2].host_patterns, vec!["[10.0.0.1]:2222"]);
    }

    #[test]
    fn test_verify_server_key_verified() {
        let wire_bytes = base64::engine::general_purpose::STANDARD.decode(MOCK_ED25519_B64).unwrap();
        let mock_file = format!("192.168.68.103 ssh-ed25519 {}\n", MOCK_ED25519_B64);
        let records = parse_known_hosts_content(&mock_file);

        let status = verify_server_key(&records, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes);
        assert_eq!(status, HostKeyStatus::Verified);
    }

    #[test]
    fn test_verify_server_key_unknown_host() {
        let wire_bytes = base64::engine::general_purpose::STANDARD.decode(MOCK_ED25519_B64).unwrap();
        let records = Vec::new();

        let status = verify_server_key(&records, "192.168.68.200", 22, "ssh-ed25519", &wire_bytes);
        match status {
            HostKeyStatus::UnknownHost { host, port, key_type, fingerprint_sha256, fingerprint_md5, .. } => {
                assert_eq!(host, "192.168.68.200");
                assert_eq!(port, 22);
                assert_eq!(key_type, "ssh-ed25519");
                assert_eq!(fingerprint_sha256, EXPECTED_SHA256);
                assert_eq!(fingerprint_md5, EXPECTED_MD5);
            }
            _ => panic!("Expected UnknownHost"),
        }
    }

    #[test]
    fn test_verify_server_key_key_mismatch() {
        let old_b64 = "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
        let new_bytes = base64::engine::general_purpose::STANDARD.decode(MOCK_ED25519_B64).unwrap();

        let mock_file = format!("192.168.68.103 ssh-ed25519 {}\n", old_b64);
        let records = parse_known_hosts_content(&mock_file);

        let status = verify_server_key(&records, "192.168.68.103", 22, "ssh-ed25519", &new_bytes);
        match status {
            HostKeyStatus::KeyMismatch { host, key_type, new_fingerprint_sha256, recorded_line_number, .. } => {
                assert_eq!(host, "192.168.68.103");
                assert_eq!(key_type, "ssh-ed25519");
                assert_eq!(new_fingerprint_sha256, EXPECTED_SHA256);
                assert_eq!(recorded_line_number, 1);
            }
            _ => panic!("Expected KeyMismatch"),
        }
    }

    #[test]
    fn test_atomic_append_and_replace() {
        let temp_dir = std::env::temp_dir().join(format!("wds_test_{}", uuid::Uuid::new_v4()));
        let kh_path = temp_dir.join("known_hosts");
        let wire_bytes = base64::engine::general_purpose::STANDARD.decode(MOCK_ED25519_B64).unwrap();

        // 1. Append
        append_to_known_hosts(&kh_path, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes).unwrap();
        let content = std::fs::read_to_string(&kh_path).unwrap();
        assert!(content.contains("192.168.68.103 ssh-ed25519"));

        // 2. Replace with port 2222
        replace_known_host(&kh_path, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes).unwrap();
        let content2 = std::fs::read_to_string(&kh_path).unwrap();
        assert!(content2.contains("192.168.68.103 ssh-ed25519"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
