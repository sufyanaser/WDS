//! Real-Time Diagnostic Log Sanitization & Secret Redaction
//! Enforces zero leakage of private keys, passwords, and tokens before logs reach memory buffers or IPC events.

use std::sync::LazyLock;
use regex::Regex;

pub const REDACTED_PRIVATE_KEY: &str = "[REDACTED_PRIVATE_KEY]";
pub const REDACTED_PASSWORD: &str = "[REDACTED_PASSWORD]";
pub const REDACTED_TOKEN: &str = "[REDACTED_TOKEN]";

// 1. Matches OpenSSH, RSA, EC, DSA, and PKCS#8 (adorned and unadorned) private key blocks
static PRIVATE_KEY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)-----BEGIN (?:[A-Z0-9 _-]+ )?PRIVATE KEY-----.*?-----END (?:[A-Z0-9 _-]+ )?PRIVATE KEY-----")
        .expect("Valid regex for private key blocks")
});

// 2. Matches passwords in key-value formats: password="...", pass=..., secret: "...", etc.
// Supports double-quoted, single-quoted (with internal spaces), and unquoted values
static PASSWORD_KV_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)(\b(?:password|pass|passwd|secret)\s*[:=]\s*)(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^"',\s\r\n]+))"#)
        .expect("Valid regex for password fields")
});

// 3. Matches Bearer authorization tokens
static BEARER_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(Bearer\s+)[a-zA-Z0-9._~+/-]+=*")
        .expect("Valid regex for Bearer tokens")
});

// 4. Matches API tokens and secrets in key-value format
static TOKEN_KV_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)(\b(?:token|auth_token|access_token|secret_key)\s*[:=]\s*)(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^"',\s\r\n]+))"#)
        .expect("Valid regex for token fields")
});

/// Redacts sensitive material from a log string before persistence or IPC broadcast
pub fn sanitize_log(input: &str) -> String {
    let s1 = PRIVATE_KEY_REGEX.replace_all(input, REDACTED_PRIVATE_KEY);
    let s2 = PASSWORD_KV_REGEX.replace_all(&s1, |caps: &regex::Captures| {
        let prefix = &caps[1];
        if caps.get(2).is_some() {
            format!("{}\"{}\"", prefix, REDACTED_PASSWORD)
        } else if caps.get(3).is_some() {
            format!("{}'{}'", prefix, REDACTED_PASSWORD)
        } else {
            format!("{}{}", prefix, REDACTED_PASSWORD)
        }
    });
    let s3 = BEARER_REGEX.replace_all(&s2, format!("${{1}}{}", REDACTED_TOKEN));
    let s4 = TOKEN_KV_REGEX.replace_all(&s3, |caps: &regex::Captures| {
        let prefix = &caps[1];
        if caps.get(2).is_some() {
            format!("{}\"{}\"", prefix, REDACTED_TOKEN)
        } else if caps.get(3).is_some() {
            format!("{}'{}'", prefix, REDACTED_TOKEN)
        } else {
            format!("{}{}", prefix, REDACTED_TOKEN)
        }
    });
    s4.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_openssh_private_key() {
        let raw = "Loading key: -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza...\n-----END OPENSSH PRIVATE KEY----- done";
        let sanitized = sanitize_log(raw);
        assert!(!sanitized.contains("BEGIN OPENSSH PRIVATE KEY"));
        assert!(sanitized.contains(REDACTED_PRIVATE_KEY));
    }

    #[test]
    fn test_redact_passwords() {
        let raw = "auth failed with secret: \"SuperSecret123!\" for user ali";
        let sanitized = sanitize_log(raw);
        assert!(!sanitized.contains("SuperSecret123!"));
        assert!(sanitized.contains(REDACTED_PASSWORD));

        let raw_kv = "connecting with password=MyPassword99&other=1";
        let sanitized_kv = sanitize_log(raw_kv);
        assert!(!sanitized_kv.contains("MyPassword99"));
        assert!(sanitized_kv.contains(REDACTED_PASSWORD));
    }

    #[test]
    fn test_redact_bearer_token() {
        let raw = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz";
        let sanitized = sanitize_log(raw);
        assert!(!sanitized.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz"));
        assert!(sanitized.contains(REDACTED_TOKEN));
    }

    #[test]
    fn test_preserve_non_sensitive_paths_and_diagnostics() {
        let safe_log = "Using key path C:\\Users\\sufya\\.ssh\\wds_mac_ed25519 on port 22";
        let sanitized = sanitize_log(safe_log);
        assert_eq!(sanitized, safe_log);
    }

    #[test]
    fn test_redact_unadorned_pkcs8_private_key() {
        let raw = "Key: -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD\n-----END PRIVATE KEY-----";
        let sanitized = sanitize_log(raw);
        assert!(!sanitized.contains("BEGIN PRIVATE KEY"));
        assert!(!sanitized.contains("MIIEvgIBAD"));
        assert!(sanitized.contains(REDACTED_PRIVATE_KEY));
    }

    #[test]
    fn test_redact_password_with_internal_spaces() {
        let raw = "connecting with password=\"my secret passphrase\" and other=1";
        let sanitized = sanitize_log(raw);
        assert!(!sanitized.contains("my secret passphrase"));
        assert!(!sanitized.contains("secret passphrase"));
        assert_eq!(
            sanitized,
            "connecting with password=\"[REDACTED_PASSWORD]\" and other=1"
        );
    }
}
