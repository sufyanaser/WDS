//! Milestone 2 Empirical Stress Test Suite
//! Designed by Empirical Challenger 1 (challenger_m2_1) to stress-test:
//! 1. OpenSSH known_hosts parser & fingerprinter (src-tauri/src/ssh/known_hosts.rs)
//! 2. Real-time log sanitizer regex scrubbing (src-tauri/src/logging/sanitizer.rs)
//! 3. Remote identity parser & verification invariants (src-tauri/src/ssh/remote_check.rs)

use base64::Engine;
use wds_connect_lib::logging::sanitizer::{
    sanitize_log, REDACTED_PASSWORD, REDACTED_PRIVATE_KEY, REDACTED_TOKEN,
};
use wds_connect_lib::ssh::known_hosts::{
    append_to_known_hosts, compute_md5_fingerprint, compute_sha256_fingerprint,
    matches_host_pattern, parse_known_hosts_content, replace_known_host,
    verify_server_key, HostKeyStatus,
};
use wds_connect_lib::ssh::remote_check::{
    parse_and_verify_identity, RemoteCheckError,
};

// ===========================================================================
// SECTION 1: OpenSSH known_hosts Parser & Fingerprinter Stress Tests
// ===========================================================================

const MOCK_ED25519_B64: &str = "AAAAC3NzaC1lZDI1NTE5AAAAIECtPpPXrjscYWqHDA/VFc1mV9zR3Xy91wK5nw4LZwkI";
const EXPECTED_SHA256: &str = "SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k";
const EXPECTED_MD5: &str = "MD5:49:6a:07:d1:11:94:1b:39:18:65:6f:24:fe:a1:82:3f";

#[test]
fn test_known_hosts_ground_truth_test_vectors() {
    let wire_bytes = base64::engine::general_purpose::STANDARD
        .decode(MOCK_ED25519_B64)
        .expect("Valid Base64 test vector");

    // 1. SHA-256 fingerprint verification (unpadded base64 matching OpenSSH ssh-keygen -l)
    let sha256_result = compute_sha256_fingerprint(&wire_bytes);
    assert_eq!(sha256_result, EXPECTED_SHA256);
    assert!(
        !sha256_result.ends_with('='),
        "OpenSSH SHA256 fingerprints MUST NOT contain base64 padding '=': {}",
        sha256_result
    );
    assert_eq!(sha256_result.len(), 7 + 43); // "SHA256:" (7) + 43 chars base64

    // 2. MD5 fingerprint verification (hex bytes matching OpenSSH ssh-keygen -l -E md5)
    let md5_result = compute_md5_fingerprint(&wire_bytes);
    assert_eq!(md5_result, EXPECTED_MD5);
    assert!(
        md5_result.starts_with("MD5:"),
        "MD5 fingerprint must start with 'MD5:': {}",
        md5_result
    );
    let parts: Vec<&str> = md5_result["MD5:".len()..].split(':').collect();
    assert_eq!(parts.len(), 16, "MD5 fingerprint must consist of 16 colon-separated hex bytes");
    for part in parts {
        assert_eq!(part.len(), 2, "Each MD5 hex octet must be 2 characters");
        assert!(part.chars().all(|c| c.is_ascii_hexdigit()), "Must be valid hex: {}", part);
    }
}

#[test]
fn test_known_hosts_crlf_vs_lf_line_endings_and_whitespace() {
    // Construct adversarial content with mixed CRLF, LF, trailing tabs/spaces, blank lines
    let crlf_content = format!(
        "# Top-level comment with Windows CRLF\r\n\
         \r\n\
         192.168.68.103 ssh-ed25519 {} ali@mac\r\n\
         \r\n\
         # Intermediate comment with LF\n\
         github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl   \n\
         \n\
         [192.168.68.103]:2222 ssh-ed25519 {}\t\r\n\
         \r\n\
         # Trailing comments and empty lines\r\n",
        MOCK_ED25519_B64, MOCK_ED25519_B64
    );

    let records = parse_known_hosts_content(&crlf_content);
    assert_eq!(records.len(), 3, "Parser must extract exactly 3 valid host records");

    // Line 1 verification
    assert_eq!(records[0].line_number, 3);
    assert_eq!(records[0].host_patterns, vec!["192.168.68.103"]);
    assert_eq!(records[0].key_type, "ssh-ed25519");
    assert_eq!(records[0].key_base64, MOCK_ED25519_B64);
    assert_eq!(records[0].comment.as_deref(), Some("ali@mac"));

    // Line 2 verification
    assert_eq!(records[1].line_number, 6);
    assert_eq!(records[1].host_patterns, vec!["github.com"]);
    assert_eq!(records[1].comment, None);

    // Line 3 verification
    assert_eq!(records[2].line_number, 8);
    assert_eq!(records[2].host_patterns, vec!["[192.168.68.103]:2222"]);
    assert_eq!(records[2].comment, None);
}

#[test]
fn test_known_hosts_bracketed_non_standard_port_syntax() {
    let wire_bytes = base64::engine::general_purpose::STANDARD
        .decode(MOCK_ED25519_B64)
        .unwrap();

    let content = format!(
        "[192.168.68.103]:2222 ssh-ed25519 {}\n\
         192.168.68.103 ssh-ed25519 {}\n\
         [10.0.0.1]:8022,10.0.0.1 ssh-ed25519 {}\n",
        MOCK_ED25519_B64, MOCK_ED25519_B64, MOCK_ED25519_B64
    );
    let records = parse_known_hosts_content(&content);

    // Query 1: Non-standard port 2222 matches bracketed entry
    let res_2222 = verify_server_key(&records, "192.168.68.103", 2222, "ssh-ed25519", &wire_bytes);
    assert_eq!(res_2222, HostKeyStatus::Verified);

    // Query 2: Standard port 22 matches unbracketed entry
    let res_22 = verify_server_key(&records, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes);
    assert_eq!(res_22, HostKeyStatus::Verified);

    // Query 3: Non-configured port 3333 must be UnknownHost
    let res_3333 = verify_server_key(&records, "192.168.68.103", 3333, "ssh-ed25519", &wire_bytes);
    assert!(matches!(res_3333, HostKeyStatus::UnknownHost { port: 3333, .. }));

    // Query 4: Comma-separated multi-pattern matching
    assert!(matches_host_pattern("[10.0.0.1]:8022", "10.0.0.1", 8022));
    assert!(matches_host_pattern("10.0.0.1", "10.0.0.1", 22));
    assert!(!matches_host_pattern("10.0.0.1", "10.0.0.1", 8022));
}

#[test]
fn test_known_hosts_key_mismatch_detection() {
    let wire_bytes_original = base64::engine::general_purpose::STANDARD
        .decode(MOCK_ED25519_B64)
        .unwrap();

    let altered_b64 = "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
    let wire_bytes_altered = base64::engine::general_purpose::STANDARD
        .decode(altered_b64)
        .unwrap();

    let content = format!("192.168.68.103 ssh-ed25519 {}\n", MOCK_ED25519_B64);
    let records = parse_known_hosts_content(&content);
    assert_eq!(records[0].key_bytes, wire_bytes_original);

    // Server presents altered key for registered host
    let mismatch_status = verify_server_key(
        &records,
        "192.168.68.103",
        22,
        "ssh-ed25519",
        &wire_bytes_altered,
    );

    match mismatch_status {
        HostKeyStatus::KeyMismatch {
            host,
            port,
            key_type,
            new_fingerprint_sha256,
            new_fingerprint_md5,
            recorded_fingerprint_sha256,
            recorded_line_number,
            wire_bytes,
        } => {
            assert_eq!(host, "192.168.68.103");
            assert_eq!(port, 22);
            assert_eq!(key_type, "ssh-ed25519");
            assert_eq!(recorded_fingerprint_sha256, EXPECTED_SHA256);
            assert_eq!(recorded_line_number, 1);
            assert_ne!(new_fingerprint_sha256, EXPECTED_SHA256);
            assert_eq!(new_fingerprint_sha256, compute_sha256_fingerprint(&wire_bytes_altered));
            assert_eq!(new_fingerprint_md5, compute_md5_fingerprint(&wire_bytes_altered));
            assert_eq!(wire_bytes, wire_bytes_altered);
        }
        other => panic!("Expected HostKeyStatus::KeyMismatch, got {:?}", other),
    }
}

#[test]
fn test_known_hosts_atomic_append_and_replace_lifecycle() {
    let temp_dir = std::env::temp_dir().join(format!("wds_kh_stress_{}", uuid::Uuid::new_v4()));
    let kh_file = temp_dir.join("known_hosts");
    let wire_bytes_1 = base64::engine::general_purpose::STANDARD
        .decode(MOCK_ED25519_B64)
        .unwrap();

    let altered_b64 = "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
    let wire_bytes_2 = base64::engine::general_purpose::STANDARD
        .decode(altered_b64)
        .unwrap();

    // 1. Append host to non-existent known_hosts file
    append_to_known_hosts(&kh_file, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes_1)
        .expect("Append should create file and write record");

    let c1 = std::fs::read_to_string(&kh_file).unwrap();
    assert!(c1.contains("192.168.68.103 ssh-ed25519"));
    assert!(c1.ends_with('\n'), "Known hosts file must end with trailing newline");

    // 2. Append non-standard port entry without leading newline issues
    append_to_known_hosts(&kh_file, "192.168.68.103", 2222, "ssh-ed25519", &wire_bytes_1)
        .expect("Append non-standard port should succeed");

    let c2 = std::fs::read_to_string(&kh_file).unwrap();
    let records = parse_known_hosts_content(&c2);
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].host_patterns, vec!["192.168.68.103"]);
    assert_eq!(records[1].host_patterns, vec!["[192.168.68.103]:2222"]);

    // 3. Replace altered key on port 22
    replace_known_host(&kh_file, "192.168.68.103", 22, "ssh-ed25519", &wire_bytes_2)
        .expect("Replace should atomically rewrite altered key");

    let c3 = std::fs::read_to_string(&kh_file).unwrap();
    let records_after_replace = parse_known_hosts_content(&c3);
    assert_eq!(records_after_replace.len(), 2);

    let port22_record = records_after_replace
        .iter()
        .find(|r| r.host_patterns == vec!["192.168.68.103"])
        .unwrap();
    assert_eq!(port22_record.key_bytes, wire_bytes_2);

    // Port 2222 record must be untouched
    let port2222_record = records_after_replace
        .iter()
        .find(|r| r.host_patterns == vec!["[192.168.68.103]:2222"])
        .unwrap();
    assert_eq!(port2222_record.key_bytes, wire_bytes_1);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

// ===========================================================================
// SECTION 2: Real-Time Log Sanitizer Regex Scrubbing Stress Tests
// ===========================================================================

#[test]
fn test_sanitizer_rsa_openssh_ec_private_key_headers() {
    let required_headers = vec![
        // PKCS#8 Unadorned PEM
        ("PKCS#8 Unadorned", "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...\n-----END PRIVATE KEY-----"),
        // RSA PEM
        ("RSA", "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"),
        // OpenSSH PEM
        ("OpenSSH", "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----"),
        // EC PEM
        ("EC", "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBA...\n-----END EC PRIVATE KEY-----"),
        // DSA PEM
        ("DSA", "-----BEGIN DSA PRIVATE KEY-----\nMIIBvAIBAAKBA...\n-----END DSA PRIVATE KEY-----"),
        // Encrypted PKCS#8 PEM
        ("Encrypted PKCS#8", "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIICojAcBgoqhkiG9w0BDAED...\n-----END ENCRYPTED PRIVATE KEY-----"),
    ];

    for (label, key_block) in required_headers {
        let raw_log = format!("Loading secret identity key ({label}):\n{key_block}\nfrom disk");
        let sanitized = sanitize_log(&raw_log);

        assert!(
            !sanitized.contains("BEGIN"),
            "Sanitized log must not contain PEM BEGIN header for {label}: {sanitized}"
        );
        assert!(
            !sanitized.contains("END"),
            "Sanitized log must not contain PEM END footer for {label}: {sanitized}"
        );
        assert!(
            sanitized.contains(REDACTED_PRIVATE_KEY),
            "Sanitized log must contain [REDACTED_PRIVATE_KEY] for {label}: {sanitized}"
        );
    }

    // Multiple keys in single message with Windows CRLF
    let multi_key_log = "Key 1: -----BEGIN RSA PRIVATE KEY-----\r\nabc123\r\n-----END RSA PRIVATE KEY-----\r\n\
                         Key 2: -----BEGIN OPENSSH PRIVATE KEY-----\r\nxyz789\r\n-----END OPENSSH PRIVATE KEY-----";
    let sanitized_multi = sanitize_log(multi_key_log);
    assert!(!sanitized_multi.contains("abc123"));
    assert!(!sanitized_multi.contains("xyz789"));
    assert_eq!(sanitized_multi.matches(REDACTED_PRIVATE_KEY).count(), 2);
}

/// Standard unadorned PKCS#8 header "-----BEGIN PRIVATE KEY-----" must be fully redacted
#[test]
fn test_sanitizer_pkcs8_unadorned_private_key_redaction() {
    let pkcs8_unadorned = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...\n-----END PRIVATE KEY-----";
    let raw_log = format!("Loading PKCS#8 key:\n{}\nfrom disk", pkcs8_unadorned);
    let sanitized = sanitize_log(&raw_log);

    assert!(
        !sanitized.contains("BEGIN PRIVATE KEY"),
        "Sanitized log must not contain PEM BEGIN header: {}",
        sanitized
    );
    assert!(
        !sanitized.contains("END PRIVATE KEY"),
        "Sanitized log must not contain PEM END footer: {}",
        sanitized
    );
    assert!(
        !sanitized.contains("MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD"),
        "Sanitized log must not leak PKCS#8 private key contents: {}",
        sanitized
    );
    assert!(
        sanitized.contains(REDACTED_PRIVATE_KEY),
        "Sanitized log must contain [REDACTED_PRIVATE_KEY]: {}",
        sanitized
    );
    assert_eq!(
        sanitized,
        format!("Loading PKCS#8 key:\n{}\nfrom disk", REDACTED_PRIVATE_KEY)
    );
}

/// Passwords containing internal spaces within quotes (e.g. password="my secret passphrase") must be fully redacted
#[test]
fn test_sanitizer_passwords_with_internal_spaces_redaction() {
    let raw_quoted = "connecting with password=\"my secret passphrase\" and other=1";
    let sanitized = sanitize_log(raw_quoted);

    assert!(
        !sanitized.contains("secret passphrase"),
        "Sanitized log must not leak trailing words of password: {}",
        sanitized
    );
    assert!(
        !sanitized.contains("my"),
        "Sanitized log must not leak leading word of password: {}",
        sanitized
    );
    assert!(
        sanitized.contains(REDACTED_PASSWORD),
        "Sanitized log must contain [REDACTED_PASSWORD]: {}",
        sanitized
    );
    assert_eq!(
        sanitized,
        format!("connecting with password=\"{}\" and other=1", REDACTED_PASSWORD)
    );
}

#[test]
fn test_sanitizer_password_formats_and_variations() {
    let password_cases = vec![
        ("password=\"SecretP@ss123!\"", "password=\"[REDACTED_PASSWORD]\""),
        ("pass=MyComplex_Pass_2026", "pass=[REDACTED_PASSWORD]"),
        ("secret: \"TopSecretVault\"", "secret: \"[REDACTED_PASSWORD]\""),
        ("passwd='SingleQuotePwd'", "passwd='[REDACTED_PASSWORD]'"),
        ("PASSWORD=\"UPPER_CASE_PASSWORD\"", "PASSWORD=\"[REDACTED_PASSWORD]\""),
        ("pass = spaced_equals", "pass = [REDACTED_PASSWORD]"),
        ("secret : \"spaced_colon\"", "secret : \"[REDACTED_PASSWORD]\""),
    ];

    for (raw, expected_snippet) in password_cases {
        let log = format!("Attempting auth with {} for user ali", raw);
        let sanitized = sanitize_log(&log);
        assert!(
            sanitized.contains(expected_snippet),
            "Expected sanitized snippet '{}' in result: '{}'",
            expected_snippet,
            sanitized
        );
    }
}

#[test]
fn test_sanitizer_bearer_tokens_and_api_secrets() {
    let bearer_jwt = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaSJ9.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    let log_bearer = format!("HTTP Authorization header: {}", bearer_jwt);
    let sanitized_bearer = sanitize_log(&log_bearer);
    assert!(!sanitized_bearer.contains("eyJhbGci"));
    assert!(sanitized_bearer.contains(&format!("Bearer {}", REDACTED_TOKEN)));

    let token_cases = vec![
        ("token=\"ghp_1234567890abcdef\"", "token=\"[REDACTED_TOKEN]\""),
        ("auth_token=super_secret_auth_token", "auth_token=[REDACTED_TOKEN]"),
        ("access_token: \"jwt_access_abc\"", "access_token: \"[REDACTED_TOKEN]\""),
        ("secret_key=\"master_signing_key_99\"", "secret_key=\"[REDACTED_TOKEN]\""),
    ];

    for (raw, expected_snippet) in token_cases {
        let log = format!("API handshake payload: {}", raw);
        let sanitized = sanitize_log(&log);
        assert!(
            sanitized.contains(expected_snippet),
            "Expected sanitized token snippet '{}' in result: '{}'",
            expected_snippet,
            sanitized
        );
    }
}

#[test]
fn test_sanitizer_preserves_safe_operational_diagnostics() {
    let safe_inputs = vec![
        "Using key path C:\\Users\\sufya\\.ssh\\wds_mac_ed25519 on port 22",
        "Connection established to ali@192.168.68.103:22 in 18ms",
        "Host key verified: SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k (ssh-ed25519)",
        "Executing remote identity check: uname -srm; id -un; sw_vers",
        "Heartbeat roundtrip latency: 2ms (3 pings sent, 0 dropped)",
    ];

    for safe in safe_inputs {
        let sanitized = sanitize_log(safe);
        assert_eq!(sanitized, safe, "Safe diagnostic string was incorrectly altered");
    }
}

// ===========================================================================
// SECTION 3: Remote Identity Parser Stress Tests
// ===========================================================================

#[test]
fn test_remote_identity_reject_nonzero_exit_codes() {
    let valid_stdout = "Darwin 24.3.0 arm64\nali\nProductName: macOS\nProductVersion: 15.3\n";

    // Non-zero exit code 1
    let err1 = parse_and_verify_identity(valid_stdout, "Permission denied", Some(1), "ali");
    match err1 {
        Err(RemoteCheckError::NonZeroExit(code, stderr)) => {
            assert_eq!(code, 1);
            assert_eq!(stderr, "Permission denied");
        }
        other => panic!("Expected NonZeroExit(1), got {:?}", other),
    }

    // Command not found 127
    let err127 = parse_and_verify_identity("", "/bin/sh: sw_vers: command not found", Some(127), "ali");
    match err127 {
        Err(RemoteCheckError::NonZeroExit(code, _)) => assert_eq!(code, 127),
        other => panic!("Expected NonZeroExit(127), got {:?}", other),
    }

    // Channel dropped without exit status (None)
    // Contract: remote_check::RemoteCheckError::MissingExitStatus (replaces the
    // earlier NonZeroExit(1) encoding; verified by remote_check unit tests).
    let err_none = parse_and_verify_identity(valid_stdout, "", None, "ali");
    match err_none {
        Err(RemoteCheckError::MissingExitStatus) => {}
        other => panic!("Expected MissingExitStatus on None, got {:?}", other),
    }
}

#[test]
fn test_remote_identity_reject_non_darwin_operating_systems() {
    let non_darwin_cases = vec![
        // Standard Linux (Ubuntu / Debian / CentOS)
        "Linux 6.8.0-40-generic x86_64\nali\n",
        // Arch Linux arm64
        "Linux 6.6.10-arch1-1 aarch64\nali\n",
        // Windows MSYS2 / Git Bash
        "MSYS_NT-10.0-22631 3.4.10.x86_64 x86_64\nali\n",
        // Windows Cygwin
        "CYGWIN_NT-10.0-22631 3.5.3-1.x86_64 x86_64\nali\n",
        // FreeBSD
        "FreeBSD 14.0-RELEASE amd64\nali\n",
        // Windows cmd error output
        "'uname' is not recognized as an internal or external command\nali\n",
    ];

    for stdout in non_darwin_cases {
        let res = parse_and_verify_identity(stdout, "", Some(0), "ali");
        match res {
            Err(RemoteCheckError::NotDarwin(raw)) => {
                assert!(!raw.starts_with("Darwin"));
            }
            other => panic!("Expected NotDarwin error for '{}', got {:?}", stdout, other),
        }
    }
}

#[test]
fn test_remote_identity_reject_user_mismatch() {
    let mismatch_cases = vec![
        ("root", "ali"),
        ("admin", "ali"),
        ("sufya", "ali"),
        ("Ali", "ali"),       // Case sensitivity enforcement
        ("ali-guest", "ali"),
    ];

    for (actual, expected) in mismatch_cases {
        let stdout = format!("Darwin 24.3.0 arm64\n{}\nProductName: macOS\n", actual);
        let res = parse_and_verify_identity(&stdout, "", Some(0), expected);
        match res {
            Err(RemoteCheckError::UserMismatch { expected: exp, actual: act }) => {
                assert_eq!(exp, expected);
                assert_eq!(act, actual);
            }
            other => panic!("Expected UserMismatch, got {:?}", other),
        }
    }
}

#[test]
fn test_remote_identity_insufficient_output_and_malformed_cases() {
    // 0 lines
    let res0 = parse_and_verify_identity("", "", Some(0), "ali");
    assert!(matches!(res0, Err(RemoteCheckError::InsufficientOutput(0))));

    // Only whitespace/newlines
    let res_ws = parse_and_verify_identity("\r\n\t  \n\n", "", Some(0), "ali");
    assert!(matches!(res_ws, Err(RemoteCheckError::InsufficientOutput(0))));

    // 1 line only (missing user line)
    let res1 = parse_and_verify_identity("Darwin 24.3.0 arm64\n", "", Some(0), "ali");
    assert!(matches!(res1, Err(RemoteCheckError::InsufficientOutput(1))));
}

#[test]
fn test_remote_identity_full_macbook_success_verification() {
    // Real macOS sw_vers + uname stdout format
    let stdout = "Darwin 24.3.0 arm64\r\nali\r\nProductName:\tmacOS\r\nProductVersion:\t15.3.1\r\nBuildVersion:\t24D70\r\n";
    let res = parse_and_verify_identity(stdout, "", Some(0), "ali")
        .expect("Should cleanly parse valid macOS Darwin identity");

    assert_eq!(res.os_name, "macOS");
    assert_eq!(res.kernel_release, "24.3.0");
    assert_eq!(res.architecture, "arm64");
    assert_eq!(res.remote_user, "ali");
    assert_eq!(res.product_version.as_deref(), Some("15.3.1"));
    assert_eq!(res.build_version.as_deref(), Some("24D70"));
    assert_eq!(res.display_summary(), "macOS 15.3.1 (Darwin 24.3.0 arm64)");
}
