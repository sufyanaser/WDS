//! russh Client Handler Implementation
//! Integrates OpenSSH known_hosts verification, async challenge suspension, and banner streaming.

use russh::client;
use russh::keys::PublicKeyOrCertificate;
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("SSH transport error: {0}")]
    Ssh(#[from] russh::Error),
    #[error("Client error: {0}")]
    Custom(String),
}

/// Messages emitted by the client handler back to the session coordinator
#[derive(Debug)]
pub enum HandlerEvent {
    /// Remote host presented a public key that requires user verification
    HostKeyChallenge {
        host: String,
        port: u16,
        key_type: String,
        fingerprint_sha256: String,
        fingerprint_md5: String,
        wire_bytes: Vec<u8>,
        is_changed: bool,
        responder: oneshot::Sender<bool>,
    },
    /// Server sent an SSH pre-auth banner
    Banner(String),
}

/// Client handler implementation for russh
pub struct WdsSshClientHandler {
    host: String,
    port: u16,
    event_tx: mpsc::Sender<HandlerEvent>,
}

impl WdsSshClientHandler {
    pub fn new(host: String, port: u16, event_tx: mpsc::Sender<HandlerEvent>) -> Self {
        Self {
            host,
            port,
            event_tx,
        }
    }
}

impl client::Handler for WdsSshClientHandler {
    type Error = ClientError;

    /// Called by russh during key exchange when the server presents its host key.
    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let (key_type, wire_bytes) = match server_public_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => {
                let kt = key.algorithm().as_str().to_string();
                let bytes = key.to_bytes().map_err(|e| ClientError::Custom(e.to_string()))?;
                (kt, bytes)
            }
            PublicKeyOrCertificate::Certificate(cert) => {
                let kt = cert.algorithm().as_str().to_string();
                let bytes = cert.to_bytes().map_err(|e| ClientError::Custom(e.to_string()))?;
                (kt, bytes)
            }
        };

        let kh_path = crate::ssh::known_hosts::resolve_known_hosts_path();
        let records = match kh_path {
            Ok(ref p) if p.exists() => {
                let content = std::fs::read_to_string(p).unwrap_or_default();
                crate::ssh::known_hosts::parse_known_hosts_content(&content)
            }
            _ => Vec::new(),
        };

        let status = crate::ssh::known_hosts::verify_server_key(&records, &self.host, self.port, &key_type, &wire_bytes);

        match status {
            crate::ssh::known_hosts::HostKeyStatus::Verified => {
                Ok(true)
            }
            crate::ssh::known_hosts::HostKeyStatus::UnknownHost { host, port, key_type, fingerprint_sha256, fingerprint_md5, wire_bytes } => {
                let (tx, rx) = oneshot::channel::<bool>();
                let event = HandlerEvent::HostKeyChallenge {
                    host,
                    port,
                    key_type,
                    fingerprint_sha256,
                    fingerprint_md5,
                    wire_bytes,
                    is_changed: false,
                    responder: tx,
                };

                if self.event_tx.send(event).await.is_err() {
                    return Ok(false);
                }

                let approved = rx.await.unwrap_or(false);
                Ok(approved)
            }
            crate::ssh::known_hosts::HostKeyStatus::KeyMismatch { host, port, key_type, new_fingerprint_sha256, new_fingerprint_md5, wire_bytes, .. } => {
                let (tx, rx) = oneshot::channel::<bool>();
                let event = HandlerEvent::HostKeyChallenge {
                    host,
                    port,
                    key_type,
                    fingerprint_sha256: new_fingerprint_sha256,
                    fingerprint_md5: new_fingerprint_md5,
                    wire_bytes,
                    is_changed: true,
                    responder: tx,
                };

                if self.event_tx.send(event).await.is_err() {
                    return Ok(false);
                }

                let approved = rx.await.unwrap_or(false);
                Ok(approved)
            }
        }
    }

    /// Server pre-auth banner notification
    async fn auth_banner(
        &mut self,
        banner: &str,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.event_tx.send(HandlerEvent::Banner(banner.to_string())).await;
        Ok(())
    }
}
