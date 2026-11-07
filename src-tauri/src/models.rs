use serde::{Deserialize, Serialize};

/// 9-State Connection Lifecycle Model
/// Represents all discrete states of the WDS Connect SSH connection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", content = "details")]
pub enum ConnectionStatus {
    /// Idle, disconnected state.
    Disconnected,

    /// Initializing TCP socket and initiating SSH protocol handshake.
    Connecting {
        host: String,
        port: u16,
    },

    /// Host key presented by remote server is unknown or does not match known_hosts.
    /// Suspends connection until explicit user confirmation is received.
    HostKeyVerificationPending {
        host: String,
        port: u16,
        key_type: String,
        fingerprint_sha256: String,
        is_changed: bool,
    },

    /// Authenticating with remote server (attempting Ed25519 public key).
    Authenticating {
        method: String,
    },

    /// Public key authentication was rejected; awaiting interactive user password.
    AuthChallengePending {
        user: String,
        host: String,
        reason: Option<String>,
    },

    /// Authentication accepted; executing mandatory harmless remote check
    /// (`uname -srm; sw_vers`) before marking connection as healthy.
    VerifyingIdentity {
        command: String,
    },

    /// Connection fully verified and active. Heartbeat monitor is running.
    Connected {
        remote_host: String,
        remote_user: String,
        remote_identity: String,
        connected_at: u64,
        latency_ms: Option<u32>,
    },

    /// Clean teardown in progress (closing channels, sending SSH disconnect packet).
    Disconnecting,

    /// Encountered unrecoverable transport error, timeout, or dropped connection.
    Error {
        code: String,
        message: String,
        timestamp: u64,
    },
}

impl ConnectionStatus {
    pub fn is_connected(&self) -> bool {
        matches!(self, ConnectionStatus::Connected { .. })
    }

    pub fn status_name(&self) -> &'static str {
        match self {
            ConnectionStatus::Disconnected => "Disconnected",
            ConnectionStatus::Connecting { .. } => "Connecting",
            ConnectionStatus::HostKeyVerificationPending { .. } => "HostKeyVerificationPending",
            ConnectionStatus::Authenticating { .. } => "Authenticating",
            ConnectionStatus::AuthChallengePending { .. } => "AuthChallengePending",
            ConnectionStatus::VerifyingIdentity { .. } => "VerifyingIdentity",
            ConnectionStatus::Connected { .. } => "Connected",
            ConnectionStatus::Disconnecting => "Disconnecting",
            ConnectionStatus::Error { .. } => "Error",
        }
    }
}

/// Application Connection Configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppConfig {
    pub remote_host: String,
    pub remote_port: u16,
    pub remote_user: String,
    pub private_key_path: String,
    pub heartbeat_interval_secs: u64,
    pub connection_timeout_secs: u64,
    pub identity_check_command: String,
    pub save_password_to_keyring: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            remote_host: "192.168.68.100".to_string(),
            remote_port: 22,
            remote_user: "ali".to_string(),
            private_key_path: "C:\\Users\\sufya\\.ssh\\wds_mac_ed25519".to_string(),
            heartbeat_interval_secs: 15,
            connection_timeout_secs: 10,
            identity_check_command: "uname -srm; sw_vers -productVersion 2>/dev/null || true".to_string(),
            save_password_to_keyring: false,
        }
    }
}

/// Local Workstation Hardware & Identity Information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalSystemInfo {
    pub hostname: String,
    pub username: String,
    pub os_name: String,
    pub local_ip: Option<String>,
}

/// Log Severity Level
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
    Ssh,
}

/// Sanitized Diagnostic Log Entry
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SanitizedLogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

/// Periodic Heartbeat Tick Event Payload
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HeartbeatTick {
    pub latency_ms: u32,
    pub timestamp: u64,
}
