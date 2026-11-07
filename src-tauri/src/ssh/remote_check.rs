//! Harmless Remote Identity Verification Module
//! Enforces: Exit code 0, Darwin OS, and expected remote user verification.

use std::time::Duration;
use russh::ChannelMsg;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteIdentity {
    pub os_name: String,
    pub kernel_release: String,
    pub architecture: String,
    pub remote_user: String,
    pub product_version: Option<String>,
    pub build_version: Option<String>,
}

impl RemoteIdentity {
    /// Formats the identity into a concise string for UI display:
    /// e.g. "macOS 15.3 (Darwin 24.3.0 arm64)" or "Darwin 24.1.0 arm64"
    pub fn display_summary(&self) -> String {
        match &self.product_version {
            Some(ver) => format!(
                "{} {} ({} {} {})",
                self.os_name, ver, "Darwin", self.kernel_release, self.architecture
            ),
            None => format!(
                "{} ({} {} {})",
                self.os_name, "Darwin", self.kernel_release, self.architecture
            ),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RemoteCheckError {
    #[error("Session channel could not be opened: {0}")]
    ChannelOpenFailed(String),
    #[error("Command execution failed: {0}")]
    ExecFailed(String),
    #[error("Remote check timed out after {0} seconds")]
    Timeout(u64),
    #[error("Remote command exited with non-zero code: {0} (stderr: {1})")]
    NonZeroExit(u32, String),
    #[error("Remote command closed without an SSH exit status")]
    MissingExitStatus,
    #[error("Remote OS identity mismatch: expected 'Darwin', got '{0}'")]
    NotDarwin(String),
    #[error("Remote user identity mismatch: expected '{expected}', got '{actual}'")]
    UserMismatch { expected: String, actual: String },
    #[error("Unexpected output format: insufficient lines returned ({0})")]
    InsufficientOutput(usize),
}

/// Executes the identity check command over a clean SSH session channel
pub async fn execute_remote_identity_check<H: russh::client::Handler + Send + Sync + 'static>(
    handle: &mut russh::client::Handle<H>,
    expected_user: &str,
    timeout_secs: u64,
) -> Result<RemoteIdentity, RemoteCheckError> {
    const IDENTITY_CMD: &str = "uname -srm; id -un; sw_vers";

    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| RemoteCheckError::ChannelOpenFailed(e.to_string()))?;

    channel
        .exec(true, IDENTITY_CMD)
        .await
        .map_err(|e| RemoteCheckError::ExecFailed(e.to_string()))?;

    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let mut exit_code: Option<u32> = None;

    let read_fut = async {
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => {
                    stdout_bytes.extend_from_slice(data);
                }
                ChannelMsg::ExtendedData { ref data, ext: 1 } => {
                    stderr_bytes.extend_from_slice(data);
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    exit_code = Some(exit_status);
                }
                // EOF only ends the data stream; exit-status may follow.
                ChannelMsg::Eof => {}
                ChannelMsg::Close => break,
                _ => {}
            }
        }
    };

    tokio::time::timeout(Duration::from_secs(timeout_secs), read_fut)
        .await
        .map_err(|_| RemoteCheckError::Timeout(timeout_secs))?;

    let stdout = String::from_utf8_lossy(&stdout_bytes).to_string();
    let stderr = String::from_utf8_lossy(&stderr_bytes).to_string();

    parse_and_verify_identity(&stdout, &stderr, exit_code, expected_user)
}

/// Pure parser function easily testable via automated unit tests
pub fn parse_and_verify_identity(
    stdout: &str,
    stderr: &str,
    exit_code: Option<u32>,
    expected_user: &str,
) -> Result<RemoteIdentity, RemoteCheckError> {
    // 1. Mandatory Gate: Exit code must be 0
    match exit_code {
        Some(0) => {}
        Some(code) => return Err(RemoteCheckError::NonZeroExit(code, stderr.trim().to_string())),
        None => return Err(RemoteCheckError::MissingExitStatus),
    }

    let lines: Vec<&str> = stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if lines.len() < 2 {
        return Err(RemoteCheckError::InsufficientOutput(lines.len()));
    }

    // Line 0: uname -srm (e.g. "Darwin 24.3.0 arm64")
    let uname_line = lines[0];
    if !uname_line.starts_with("Darwin") {
        return Err(RemoteCheckError::NotDarwin(uname_line.to_string()));
    }

    let uname_parts: Vec<&str> = uname_line.split_whitespace().collect();
    let kernel_release = uname_parts.get(1).unwrap_or(&"unknown").to_string();
    let architecture = uname_parts.get(2).unwrap_or(&"unknown").to_string();

    // Line 1: id -un (e.g. "ali")
    let actual_user = lines[1];
    if actual_user != expected_user {
        return Err(RemoteCheckError::UserMismatch {
            expected: expected_user.to_string(),
            actual: actual_user.to_string(),
        });
    }

    // Lines 2+: sw_vers (ProductName, ProductVersion, BuildVersion)
    let mut os_name = "macOS".to_string();
    let mut product_version = None;
    let mut build_version = None;

    for line in lines.iter().skip(2) {
        if let Some(val) = line.strip_prefix("ProductName:") {
            os_name = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("ProductVersion:") {
            product_version = Some(val.trim().to_string());
        } else if let Some(val) = line.strip_prefix("BuildVersion:") {
            build_version = Some(val.trim().to_string());
        }
    }

    Ok(RemoteIdentity {
        os_name,
        kernel_release,
        architecture,
        remote_user: actual_user.to_string(),
        product_version,
        build_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_verify_identity_success() {
        let stdout = "Darwin 24.3.0 arm64\nali\nProductName: macOS\nProductVersion: 15.3\nBuildVersion: 24D60\n";
        let res = parse_and_verify_identity(stdout, "", Some(0), "ali").unwrap();
        assert_eq!(res.os_name, "macOS");
        assert_eq!(res.kernel_release, "24.3.0");
        assert_eq!(res.architecture, "arm64");
        assert_eq!(res.remote_user, "ali");
        assert_eq!(res.product_version.as_deref(), Some("15.3"));
        assert_eq!(res.display_summary(), "macOS 15.3 (Darwin 24.3.0 arm64)");
    }

    #[test]
    fn test_reject_missing_exit_status() {
        let stdout = "Darwin 24.3.0 arm64\nali\n";
        let res = parse_and_verify_identity(stdout, "", None, "ali");
        assert!(matches!(res, Err(RemoteCheckError::MissingExitStatus)));
    }

    #[test]
    fn test_reject_nonzero_exit() {
        let stdout = "Darwin 24.3.0 arm64\nali\n";
        let res = parse_and_verify_identity(stdout, "Permission denied", Some(1), "ali");
        assert!(matches!(res, Err(RemoteCheckError::NonZeroExit(1, _))));
    }

    #[test]
    fn test_reject_non_darwin_os() {
        let stdout = "Linux 6.6.0-amd64 x86_64\nali\n";
        let res = parse_and_verify_identity(stdout, "", Some(0), "ali");
        assert!(matches!(res, Err(RemoteCheckError::NotDarwin(_))));
    }

    #[test]
    fn test_reject_user_mismatch() {
        let stdout = "Darwin 24.3.0 arm64\nroot\n";
        let res = parse_and_verify_identity(stdout, "", Some(0), "ali");
        assert!(matches!(res, Err(RemoteCheckError::UserMismatch { .. })));
    }

    #[test]
    fn test_reject_insufficient_output() {
        let stdout = "Darwin\n";
        let res = parse_and_verify_identity(stdout, "", Some(0), "ali");
        assert!(matches!(res, Err(RemoteCheckError::InsufficientOutput(1))));
    }
}
