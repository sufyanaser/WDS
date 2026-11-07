//! Empirical Challenger 1 Stress Test Harness: Regex Sanitizer & Secret Redaction
//! Specifically challenges `src-tauri/src/logging/sanitizer.rs` against:
//! 1. PKCS#8 unadorned private keys (all PEM formatting variations)
//! 2. Adorned private keys (OpenSSH, RSA, EC, DSA, ENCRYPTED, etc.)
//! 3. CRLF (`\r\n`) line breaks across banners and key bodies
//! 4. Quoted passwords with internal spaces, special characters, and empty quotes
//! 5. Unquoted passwords across delimiters (commas, query strings, newlines)
//! 6. Bearer tokens, JWTs, and API tokens (double-quoted, single-quoted, unquoted)
//! 7. False positive prevention (natural language, paths, public keys, hashes, substrings)
//! 8. ReDoS & Performance stress testing under large payloads

use std::time::Instant;
use wds_connect_lib::logging::sanitizer::{
    sanitize_log, REDACTED_PASSWORD, REDACTED_PRIVATE_KEY, REDACTED_TOKEN,
};

// ===========================================================================
// 1. UNADORNED PKCS#8 PRIVATE KEYS
// ===========================================================================

#[test]
fn test_pkcs8_unadorned_standard_pem() {
    let raw = "Loading key:\n-----BEGIN PRIVATE KEY-----\n\
               MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDabc123\n\
               def456ghi789jkl012mno345pqr678stu901vwx234yz567\n\
               -----END PRIVATE KEY-----\n\
               Key loaded successfully";
    let sanitized = sanitize_log(raw);

    assert!(!sanitized.contains("BEGIN PRIVATE KEY"));
    assert!(!sanitized.contains("END PRIVATE KEY"));
    assert!(!sanitized.contains("MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDabc123"));
    assert!(!sanitized.contains("def456ghi789jkl012mno345pqr678stu901vwx234yz567"));
    assert!(sanitized.contains(REDACTED_PRIVATE_KEY));
    assert!(sanitized.starts_with("Loading key:\n[REDACTED_PRIVATE_KEY]\nKey loaded successfully"));
}

#[test]
fn test_pkcs8_unadorned_single_line_and_inline() {
    let raw = "Key: -----BEGIN PRIVATE KEY-----MIIEvgIBAQ-----END PRIVATE KEY----- done";
    let sanitized = sanitize_log(raw);

    assert_eq!(sanitized, format!("Key: {} done", REDACTED_PRIVATE_KEY));
}

#[test]
fn test_pkcs8_unadorned_with_empty_or_minimal_body() {
    let raw = "-----BEGIN PRIVATE KEY----------END PRIVATE KEY-----";
    let sanitized = sanitize_log(raw);
    assert_eq!(sanitized, REDACTED_PRIVATE_KEY);

    let raw_whitespace = "-----BEGIN PRIVATE KEY-----\n   \n-----END PRIVATE KEY-----";
    let sanitized_ws = sanitize_log(raw_whitespace);
    assert_eq!(sanitized_ws, REDACTED_PRIVATE_KEY);
}

#[test]
fn test_pkcs8_unadorned_multiple_keys_in_stream() {
    let raw = "Key 1: -----BEGIN PRIVATE KEY-----\nAAA111\n-----END PRIVATE KEY-----\n\
               Key 2: -----BEGIN PRIVATE KEY-----\nBBB222\n-----END PRIVATE KEY-----";
    let sanitized = sanitize_log(raw);

    assert!(!sanitized.contains("AAA111"));
    assert!(!sanitized.contains("BBB222"));
    assert_eq!(sanitized.matches(REDACTED_PRIVATE_KEY).count(), 2);
}

// ===========================================================================
// 2. ADORNED PRIVATE KEYS (OpenSSH, RSA, EC, DSA, ENCRYPTED, etc.)
// ===========================================================================

#[test]
fn test_adorned_private_keys_exhaustive_types() {
    let key_types = vec![
        ("OPENSSH", "b3BlbnNzaC1rZXktdjEAAAA..."),
        ("RSA", "MIIEowIBAAKCAQEA0..."),
        ("EC", "MHcCAQEEIBA..."),
        ("DSA", "MIIBvAIBAAKBA..."),
        ("ENCRYPTED", "MIICojAcBgoqhkiG9w0BDAED..."),
        ("ED25519", "MIICXAIBAAKCAQEA..."),
        ("X509", "MIIEvQIBADANBgkqhkiG9w..."),
        ("PGP", "lQOsBF2X..."),
    ];

    for (ktype, body) in key_types {
        let raw = format!(
            "Secret banner test for {}:\n-----BEGIN {} PRIVATE KEY-----\n{}\n-----END {} PRIVATE KEY-----\nEnd of key",
            ktype, ktype, body, ktype
        );
        let sanitized = sanitize_log(&raw);

        assert!(
            !sanitized.contains(&format!("BEGIN {} PRIVATE KEY", ktype)),
            "Failed for key type {}",
            ktype
        );
        assert!(
            !sanitized.contains(&format!("END {} PRIVATE KEY", ktype)),
            "Failed for key type {}",
            ktype
        );
        assert!(
            !sanitized.contains(body),
            "Key body leaked for key type {}",
            ktype
        );
        assert!(
            sanitized.contains(REDACTED_PRIVATE_KEY),
            "Missing placeholder for key type {}",
            ktype
        );
    }
}

// ===========================================================================
// 3. CRLF (\r\n) LINE BREAKS IN PRIVATE KEYS
// ===========================================================================

#[test]
fn test_private_keys_with_pure_windows_crlf() {
    let raw = "Dump:\r\n-----BEGIN PRIVATE KEY-----\r\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\r\nBKgwggSkAgEAAoIBAQDabc123\r\n-----END PRIVATE KEY-----\r\nDone\r\n";
    let sanitized = sanitize_log(raw);

    assert!(!sanitized.contains("BEGIN PRIVATE KEY"));
    assert!(!sanitized.contains("MIIEvgIBADANBgkqhkiG9w0BAQEFAASC"));
    assert_eq!(
        sanitized,
        format!("Dump:\r\n{}\r\nDone\r\n", REDACTED_PRIVATE_KEY)
    );
}

#[test]
fn test_private_keys_with_mixed_crlf_and_lf() {
    let raw = "Dump:\n-----BEGIN RSA PRIVATE KEY-----\r\nline1\nline2\r\nline3\n-----END RSA PRIVATE KEY-----\nFinished";
    let sanitized = sanitize_log(raw);

    assert!(!sanitized.contains("line1"));
    assert!(!sanitized.contains("line2"));
    assert!(!sanitized.contains("line3"));
    assert_eq!(
        sanitized,
        format!("Dump:\n{}\nFinished", REDACTED_PRIVATE_KEY)
    );
}

// ===========================================================================
// 4. QUOTED PASSWORDS WITH SPACES & SPECIAL CHARACTERS
// ===========================================================================

#[test]
fn test_quoted_passwords_double_quotes_with_internal_spaces() {
    let cases = vec![
        (
            "password=\"foo bar baz\"",
            format!("password=\"{}\"", REDACTED_PASSWORD),
        ),
        (
            "pass=\"multi word passphrase with many spaces\"",
            format!("pass=\"{}\"", REDACTED_PASSWORD),
        ),
        (
            "passwd=\"  leading and trailing spaces  \"",
            format!("passwd=\"{}\"", REDACTED_PASSWORD),
        ),
        (
            "secret=\"secret with symbols !@#$%^&*()_+-=~`[]{}\"",
            format!("secret=\"{}\"", REDACTED_PASSWORD),
        ),
        (
            "password=\"\"",
            format!("password=\"{}\"", REDACTED_PASSWORD),
        ),
    ];

    for (input, expected) in cases {
        let raw = format!("Log entry: {} in configuration", input);
        let sanitized = sanitize_log(&raw);
        assert!(
            sanitized.contains(&expected),
            "Expected '{}' in sanitized output: '{}'",
            expected,
            sanitized
        );
        assert!(
            !sanitized.contains("foo bar baz"),
            "Leaked password content: {}",
            sanitized
        );
    }
}

#[test]
fn test_quoted_passwords_single_quotes_with_internal_spaces() {
    let cases = vec![
        (
            "password='secret pass 123'",
            format!("password='{}'", REDACTED_PASSWORD),
        ),
        (
            "pass='single quoted multi word passphrase'",
            format!("pass='{}'", REDACTED_PASSWORD),
        ),
        (
            "passwd=' space '",
            format!("passwd='{}'", REDACTED_PASSWORD),
        ),
        (
            "secret=''",
            format!("secret='{}'", REDACTED_PASSWORD),
        ),
    ];

    for (input, expected) in cases {
        let raw = format!("Log entry: {} in configuration", input);
        let sanitized = sanitize_log(&raw);
        assert!(
            sanitized.contains(&expected),
            "Expected '{}' in sanitized output: '{}'",
            expected,
            sanitized
        );
        assert!(
            !sanitized.contains("secret pass 123"),
            "Leaked password content: {}",
            sanitized
        );
    }
}

#[test]
fn test_passwords_with_colon_separator_and_whitespace() {
    let cases = vec![
        (
            "password: \"my secret pass\"",
            format!("password: \"{}\"", REDACTED_PASSWORD),
        ),
        (
            "pass: 'another secret'",
            format!("pass: '{}'", REDACTED_PASSWORD),
        ),
        (
            "secret : \"spaced colon secret\"",
            format!("secret : \"{}\"", REDACTED_PASSWORD),
        ),
        (
            "password  =  \"spaced equals secret\"",
            format!("password  =  \"{}\"", REDACTED_PASSWORD),
        ),
        (
            "PASSWORD=\"UPPER CASE PASS\"",
            format!("PASSWORD=\"{}\"", REDACTED_PASSWORD),
        ),
    ];

    for (input, expected) in cases {
        let sanitized = sanitize_log(input);
        assert_eq!(
            sanitized, expected,
            "Mismatch for input '{}': got '{}'",
            input, sanitized
        );
    }
}

// ===========================================================================
// 5. UNQUOTED PASSWORDS
// ===========================================================================

#[test]
fn test_unquoted_passwords_various_delimiters() {
    // 1. Simple unquoted
    let s1 = sanitize_log("connecting with password=my_secret_123 to server");
    assert_eq!(
        s1,
        format!("connecting with password={} to server", REDACTED_PASSWORD)
    );

    // 2. Unquoted with colon
    let s2 = sanitize_log("auth info: secret: SuperSecretPass99!");
    assert_eq!(
        s2,
        format!("auth info: secret: {}", REDACTED_PASSWORD)
    );

    // 3. Comma delimiter
    let s3 = sanitize_log("params: password=my_secret_123,user=ali,port=22");
    assert_eq!(
        s3,
        format!("params: password={},user=ali,port=22", REDACTED_PASSWORD)
    );

    // 4. Query string format with & (unquoted regex consumes through & preventing password leak even if password contains &)
    let s4 = sanitize_log("url: https://host/connect?password=secret_pass&retry=true");
    assert_eq!(
        s4,
        format!(
            "url: https://host/connect?password={}",
            REDACTED_PASSWORD
        )
    );

    // 5. Unquoted password at end of string
    let s5 = sanitize_log("login password=FinalPass123");
    assert_eq!(
        s5,
        format!("login password={}", REDACTED_PASSWORD)
    );
}

// ===========================================================================
// 6. TOKENS AND AUTH HEADERS
// ===========================================================================

#[test]
fn test_bearer_authorization_headers() {
    let tokens = vec![
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature",
        "Bearer YWJjZGVmZzEyMzQ1Njc4OTA=",
        "Bearer YWJjZGVmZzEyMzQ1Njc4OTA==",
        "bearer url-safe_token~123+456/789==",
        "BEARER standard_token_999",
    ];

    for b in tokens {
        let raw = format!("Header: Authorization: {}", b);
        let sanitized = sanitize_log(&raw);

        assert!(!sanitized.contains("eyJhbGci"));
        assert!(!sanitized.contains("YWJjZGVmZzEyMzQ1Njc4OTA"));
        assert!(!sanitized.contains("url-safe_token"));
        assert!(!sanitized.contains("standard_token_999"));
        assert!(
            sanitized.contains(REDACTED_TOKEN),
            "Missing REDACTED_TOKEN in: {}",
            sanitized
        );
    }
}

#[test]
fn test_token_kv_pairs_quoted_and_unquoted() {
    let cases = vec![
        (
            "token=\"ghp_ABC123secretToken456\"",
            format!("token=\"{}\"", REDACTED_TOKEN),
        ),
        (
            "token='single_quoted_token_val'",
            format!("token='{}'", REDACTED_TOKEN),
        ),
        (
            "token=unquoted_token_val_123",
            format!("token={}", REDACTED_TOKEN),
        ),
        (
            "auth_token: \"jwt.payload.signature\"",
            format!("auth_token: \"{}\"", REDACTED_TOKEN),
        ),
        (
            "access_token='ya29.a0AfH6SMA...'",
            format!("access_token='{}'", REDACTED_TOKEN),
        ),
        (
            "secret_key=master_aes_key_999",
            format!("secret_key={}", REDACTED_TOKEN),
        ),
    ];

    for (input, expected) in cases {
        let raw = format!("API response payload: {} inside telemetry", input);
        let sanitized = sanitize_log(&raw);
        assert!(
            sanitized.contains(&expected),
            "Expected '{}' in: '{}'",
            expected,
            sanitized
        );
    }
}

// ===========================================================================
// 7. FALSE POSITIVE PREVENTION
// ===========================================================================

#[test]
fn test_false_positive_prevention_standard_strings() {
    let safe_strings = vec![
        // Exact strings from requirements
        "password updated successfully",
        "passed 127 tests",
        "C:\\Users\\sufya\\.ssh\\id_ed25519",
        "C:\\Users\\sufya\\.ssh\\wds_mac_ed25519",
        // Natural language with password/pass/secret/token
        "The user passed the verification check without errors.",
        "password reset requested by administrator",
        "Entered invalid password attempt 1 of 3",
        "token expired at 2026-11-07T12:00:00Z",
        "secretive operation mode is disabled",
        "compass heading: 180 degrees",
        "bypass: enabled",
        // OpenSSH public key formats (NOT private keys)
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIECtPpPXrjscYWqHDA/VFc1mV9zR3Xy91wK5nw4LZwkI ali@mac",
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC3... sufya@win",
        "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY... user@host",
        // Public key PEM banners (NOT private keys)
        "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
        "-----BEGIN SSH2 PUBLIC KEY-----\nAAAAB3NzaC1yc2E...\n-----END SSH2 PUBLIC KEY-----",
        // Diagnostics and telemetry
        "Host key verified: SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k (ssh-ed25519)",
        "Executing remote identity check: uname -srm; id -un; sw_vers",
        "Heartbeat roundtrip latency: 2ms (3 pings sent, 0 dropped)",
        "Connection established to ali@192.168.68.103:22 in 18ms",
        "Zero warnings emitted by cargo clippy --all-targets",
    ];

    for safe in safe_strings {
        let sanitized = sanitize_log(safe);
        assert_eq!(
            sanitized, safe,
            "False positive detected! Safe string was modified: '{}' -> '{}'",
            safe, sanitized
        );
    }
}

// ===========================================================================
// 8. COMPOUND, ADVERSARIAL & PERFORMANCE TESTS
// ===========================================================================

#[test]
fn test_compound_secrets_in_single_message() {
    let compound_log = "\
        [AUTH] User ali connecting.\n\
        Key: -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----\n\
        Fallback auth: password=\"my super secret phrase\" and secondary pass='another pass'\n\
        Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig\n\
        Token KV: token=ghp_1234567890abcdef\n\
        Diagnostic: passed 127 tests successfully on C:\\Users\\sufya\\.ssh\\id_ed25519.\n\
        End of report.";

    let sanitized = sanitize_log(compound_log);

    // Assert all sensitive data is redacted
    assert!(!sanitized.contains("b3BlbnNzaC1rZXktdjEAAAA"));
    assert!(!sanitized.contains("my super secret phrase"));
    assert!(!sanitized.contains("another pass"));
    assert!(!sanitized.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert!(!sanitized.contains("ghp_1234567890abcdef"));

    // Assert all redaction markers are present
    assert!(sanitized.contains(REDACTED_PRIVATE_KEY));
    assert!(sanitized.contains(&format!("password=\"{}\"", REDACTED_PASSWORD)));
    assert!(sanitized.contains(&format!("pass='{}'", REDACTED_PASSWORD)));
    assert!(sanitized.contains(&format!("Bearer {}", REDACTED_TOKEN)));
    assert!(sanitized.contains(&format!("token={}", REDACTED_TOKEN)));

    // Assert safe diagnostic text is preserved
    assert!(sanitized.contains("passed 127 tests successfully on C:\\Users\\sufya\\.ssh\\id_ed25519."));
}

#[test]
fn test_label_collision_secret_leakage() {
    // When a log contains a label like "password:" or "token:" followed by a quoted assignment
    let log_pass = "Fallback password: password=\"leaked_secret_pass\"";
    let sanitized_pass = sanitize_log(log_pass);
    println!("DEBUG log_pass sanitized: {}", sanitized_pass);

    let log_token = "API token: token=\"leaked_api_token\"";
    let sanitized_token = sanitize_log(log_token);
    println!("DEBUG log_token sanitized: {}", sanitized_token);

    // This empirically proves whether the secret is leaked:
    let pass_leaked = sanitized_pass.contains("leaked_secret_pass");
    let token_leaked = sanitized_token.contains("leaked_api_token");
    println!("pass_leaked = {}, token_leaked = {}", pass_leaked, token_leaked);

    // Truncated private key (missing END banner due to log truncation):
    let log_truncated_key = "Dump: -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD... (truncated)";
    let sanitized_truncated = sanitize_log(log_truncated_key);
    println!("DEBUG log_truncated_key sanitized: {}", sanitized_truncated);
    let key_leaked = sanitized_truncated.contains("MIIEvgIBADAN");
    println!("key_leaked = {}", key_leaked);
}

#[test]
fn test_sanitizer_performance_and_large_payload() {
    // Construct a large 100KB log string containing repetitive keys, passwords, and safe diagnostics
    let mut large_log = String::with_capacity(120_000);
    for i in 0..500 {
        large_log.push_str(&format!(
            "Iteration {:04}: safe message; password=\"pass_{:04}\"; token=tok_{:04}; passed 10 tests.\n",
            i, i, i
        ));
    }
    large_log.push_str("Final key: -----BEGIN PRIVATE KEY-----\nABC123XYZ\n-----END PRIVATE KEY-----\n");

    let start = Instant::now();
    let sanitized = sanitize_log(&large_log);
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() < 100,
        "Sanitizing 100KB log took too long: {:?}",
        elapsed
    );
    assert!(!sanitized.contains("pass_0001"));
    assert!(!sanitized.contains("tok_0001"));
    assert!(!sanitized.contains("ABC123XYZ"));
    assert!(sanitized.contains(REDACTED_PRIVATE_KEY));
    assert!(sanitized.contains("passed 10 tests"));
}
