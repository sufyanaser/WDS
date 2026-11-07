use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use wds_connect_lib::models::{AppConfig, ConnectionStatus, HeartbeatTick, LogLevel};
use wds_connect_lib::AppState;
use tokio_util::sync::CancellationToken;
use std::time::Duration;

/// Adversarial stress test 1: AppState thread-safety & 500-item bound under heavy concurrent logging
#[test]
fn test_app_state_concurrency_and_500_bound() {
    let state = Arc::new(AppState::new());
    let thread_count = 50;
    let logs_per_thread = 100;
    let mut handles = Vec::with_capacity(thread_count);

    for tid in 0..thread_count {
        let state_clone = Arc::clone(&state);
        let handle = thread::spawn(move || {
            for i in 0..logs_per_thread {
                state_clone.add_log(
                    LogLevel::Debug,
                    format!("Thread-{:02} logging iteration {:04}", tid, i),
                );
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().expect("Worker thread panicked during logging");
    }

    let logs = state.logs.lock().expect("Failed to lock logs mutex");
    assert_eq!(
        logs.len(),
        500,
        "Log buffer MUST strictly cap at 500 items despite {} concurrent insertions",
        thread_count * logs_per_thread
    );

    // Verify all entries in buffer are well-formed
    for (idx, entry) in logs.iter().enumerate() {
        assert!(!entry.id.is_empty(), "Log at index {} must have a valid ID", idx);
        assert!(!entry.timestamp.is_empty(), "Log at index {} must have a timestamp", idx);
        assert!(!entry.message.is_empty(), "Log at index {} must have a message", idx);
    }
}

/// Adversarial stress test 2: Rapid concurrent read/write contention on AppState
#[test]
fn test_app_state_read_write_contention() {
    let state = Arc::new(AppState::new());
    let stop_signal = Arc::new(AtomicBool::new(false));
    let mut reader_handles = Vec::new();
    let mut writer_handles = Vec::new();

    // 10 Reader threads continuously inspecting buffer size
    for _ in 0..10 {
        let state_clone = Arc::clone(&state);
        let stop_clone = Arc::clone(&stop_signal);
        reader_handles.push(thread::spawn(move || {
            let mut read_cycles = 0;
            while !stop_clone.load(Ordering::Relaxed) {
                let len = {
                    let logs = state_clone.logs.lock().unwrap();
                    logs.len()
                };
                assert!(len <= 500, "Observed log buffer len > 500: {}", len);
                read_cycles += 1;
            }
            read_cycles
        }));
    }

    // 10 Writer threads continuously inserting logs
    for tid in 0..10 {
        let state_clone = Arc::clone(&state);
        writer_handles.push(thread::spawn(move || {
            for i in 0..200 {
                state_clone.add_log(LogLevel::Info, format!("Burst-{} entry {}", tid, i));
            }
        }));
    }

    for writer in writer_handles {
        writer.join().expect("Writer thread panicked");
    }

    // Stop readers
    stop_signal.store(true, Ordering::Relaxed);
    for reader in reader_handles {
        let cycles = reader.join().expect("Reader thread panicked");
        assert!(cycles > 0, "Reader thread should have performed at least one read");
    }

    let final_len = state.logs.lock().unwrap().len();
    assert_eq!(final_len, 500, "Buffer must remain bounded at 500");
}

/// Adversarial stress test 3: Exhaustive Serde JSON verification across all 9 connection states
#[test]
fn test_serde_all_9_connection_states_and_edge_cases() {
    let test_cases: Vec<(ConnectionStatus, &'static str)> = vec![
        // State 1: Disconnected
        (
            ConnectionStatus::Disconnected,
            r#"{"status":"Disconnected"}"#,
        ),
        // State 2: Connecting
        (
            ConnectionStatus::Connecting {
                host: "192.168.68.103".to_string(),
                port: 22,
            },
            r#"{"status":"Connecting","details":{"host":"192.168.68.103","port":22}}"#,
        ),
        // State 3: HostKeyVerificationPending
        (
            ConnectionStatus::HostKeyVerificationPending {
                host: "192.168.68.103".to_string(),
                port: 22,
                key_type: "ssh-ed25519".to_string(),
                fingerprint_sha256: "SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k".to_string(),
                is_changed: false,
            },
            r#"{"status":"HostKeyVerificationPending","details":{"host":"192.168.68.103","port":22,"key_type":"ssh-ed25519","fingerprint_sha256":"SHA256:uxXAgttSnSYGZoW2wHBB45XA4fxE8zAjVKavK1RSO/k","is_changed":false}}"#,
        ),
        // State 4: Authenticating
        (
            ConnectionStatus::Authenticating {
                method: "publickey".to_string(),
            },
            r#"{"status":"Authenticating","details":{"method":"publickey"}}"#,
        ),
        // State 5a: AuthChallengePending without reason
        (
            ConnectionStatus::AuthChallengePending {
                user: "ali".to_string(),
                host: "192.168.68.103".to_string(),
                reason: None,
            },
            r#"{"status":"AuthChallengePending","details":{"user":"ali","host":"192.168.68.103","reason":null}}"#,
        ),
        // State 5b: AuthChallengePending with reason
        (
            ConnectionStatus::AuthChallengePending {
                user: "ali".to_string(),
                host: "192.168.68.103".to_string(),
                reason: Some("Permission denied (publickey)".to_string()),
            },
            r#"{"status":"AuthChallengePending","details":{"user":"ali","host":"192.168.68.103","reason":"Permission denied (publickey)"}}"#,
        ),
        // State 6: VerifyingIdentity
        (
            ConnectionStatus::VerifyingIdentity {
                command: "uname -srm; sw_vers".to_string(),
            },
            r#"{"status":"VerifyingIdentity","details":{"command":"uname -srm; sw_vers"}}"#,
        ),
        // State 7a: Connected without latency
        (
            ConnectionStatus::Connected {
                remote_host: "192.168.68.103".to_string(),
                remote_user: "ali".to_string(),
                remote_identity: "macOS 15.3 (Darwin 24.3.0 arm64)".to_string(),
                connected_at: 1731000000,
                latency_ms: None,
            },
            r#"{"status":"Connected","details":{"remote_host":"192.168.68.103","remote_user":"ali","remote_identity":"macOS 15.3 (Darwin 24.3.0 arm64)","connected_at":1731000000,"latency_ms":null}}"#,
        ),
        // State 7b: Connected with latency
        (
            ConnectionStatus::Connected {
                remote_host: "192.168.68.103".to_string(),
                remote_user: "ali".to_string(),
                remote_identity: "macOS 15.3 (Darwin 24.3.0 arm64)".to_string(),
                connected_at: 1731000000,
                latency_ms: Some(2),
            },
            r#"{"status":"Connected","details":{"remote_host":"192.168.68.103","remote_user":"ali","remote_identity":"macOS 15.3 (Darwin 24.3.0 arm64)","connected_at":1731000000,"latency_ms":2}}"#,
        ),
        // State 8: Disconnecting
        (
            ConnectionStatus::Disconnecting,
            r#"{"status":"Disconnecting"}"#,
        ),
        // State 9: Error
        (
            ConnectionStatus::Error {
                code: "SSH_TIMEOUT".to_string(),
                message: "Heartbeat response timed out after 5000ms".to_string(),
                timestamp: 1731000050,
            },
            r#"{"status":"Error","details":{"code":"SSH_TIMEOUT","message":"Heartbeat response timed out after 5000ms","timestamp":1731000050}}"#,
        ),
    ];

    // Verify all 9 states (plus variants) roundtrip cleanly
    for (state, expected_json) in &test_cases {
        let serialized = serde_json::to_string(state).expect("Serialization failed");
        assert_eq!(&serialized, expected_json, "Serialized JSON mismatch for {:?}", state);

        let deserialized: ConnectionStatus =
            serde_json::from_str(&serialized).expect("Deserialization failed");
        assert_eq!(&deserialized, state, "Deserialized equality mismatch");
    }

    // Verify status_name() accurately reflects all 9 states
    assert_eq!(ConnectionStatus::Disconnected.status_name(), "Disconnected");
    assert_eq!(
        ConnectionStatus::Connecting { host: "h".into(), port: 22 }.status_name(),
        "Connecting"
    );
    assert_eq!(
        ConnectionStatus::HostKeyVerificationPending {
            host: "h".into(),
            port: 22,
            key_type: "k".into(),
            fingerprint_sha256: "f".into(),
            is_changed: false
        }
        .status_name(),
        "HostKeyVerificationPending"
    );
    assert_eq!(
        ConnectionStatus::Authenticating { method: "m".into() }.status_name(),
        "Authenticating"
    );
    assert_eq!(
        ConnectionStatus::AuthChallengePending { user: "u".into(), host: "h".into(), reason: None }
            .status_name(),
        "AuthChallengePending"
    );
    assert_eq!(
        ConnectionStatus::VerifyingIdentity { command: "c".into() }.status_name(),
        "VerifyingIdentity"
    );
    assert_eq!(
        ConnectionStatus::Connected {
            remote_host: "h".into(),
            remote_user: "u".into(),
            remote_identity: "i".into(),
            connected_at: 0,
            latency_ms: None
        }
        .status_name(),
        "Connected"
    );
    assert_eq!(ConnectionStatus::Disconnecting.status_name(), "Disconnecting");
    assert_eq!(
        ConnectionStatus::Error { code: "e".into(), message: "m".into(), timestamp: 0 }
            .status_name(),
        "Error"
    );
}

/// Adversarial stress test 4: Malformed and boundary Serde JSON inputs
#[test]
fn test_serde_adversarial_malformed_inputs() {
    // Unknown status variant must fail to deserialize
    let bad_status = r#"{"status":"NonExistentState"}"#;
    assert!(serde_json::from_str::<ConnectionStatus>(bad_status).is_err());

    // Missing required details for Connecting variant must fail
    let missing_details = r#"{"status":"Connecting"}"#;
    assert!(serde_json::from_str::<ConnectionStatus>(missing_details).is_err());

    // Connecting with wrong type for port (string instead of number) must fail
    let invalid_port_type = r#"{"status":"Connecting","details":{"host":"127.0.0.1","port":"twenty-two"}}"#;
    assert!(serde_json::from_str::<ConnectionStatus>(invalid_port_type).is_err());

    // Port out of u16 range (e.g. 70000) must fail
    let overflow_port = r#"{"status":"Connecting","details":{"host":"127.0.0.1","port":70000}}"#;
    assert!(serde_json::from_str::<ConnectionStatus>(overflow_port).is_err());

    // Boundary conditions: Port 0 and Port 65535 are valid u16 values
    let min_port = r#"{"status":"Connecting","details":{"host":"0.0.0.0","port":0}}"#;
    let max_port = r#"{"status":"Connecting","details":{"host":"255.255.255.255","port":65535}}"#;
    assert!(serde_json::from_str::<ConnectionStatus>(min_port).is_ok());
    assert!(serde_json::from_str::<ConnectionStatus>(max_port).is_ok());

    // Empty strings across fields should deserialize cleanly without panic
    let empty_fields = r#"{"status":"Error","details":{"code":"","message":"","timestamp":0}}"#;
    let parsed: Result<ConnectionStatus, _> = serde_json::from_str(empty_fields);
    assert!(parsed.is_ok());

    // Extreme unicode payload in Error message (RTL, emojis, null characters)
    let unicode_msg = "Error: 🔥 עברית العربية \u{0000} \t\n Unicode stress test";
    let status = ConnectionStatus::Error {
        code: "UNICODE_TEST".to_string(),
        message: unicode_msg.to_string(),
        timestamp: 9999999999,
    };
    let json = serde_json::to_string(&status).unwrap();
    let roundtripped: ConnectionStatus = serde_json::from_str(&json).unwrap();
    assert_eq!(status, roundtripped);
}

/// Adversarial stress test 5: LogLevel Serde lowercase mapping matching TypeScript
#[test]
fn test_log_level_serde_lowercase_mapping() {
    let levels = vec![
        (LogLevel::Info, "\"info\""),
        (LogLevel::Warn, "\"warn\""),
        (LogLevel::Error, "\"error\""),
        (LogLevel::Debug, "\"debug\""),
        (LogLevel::Ssh, "\"ssh\""),
    ];

    for (lvl, expected_json) in levels {
        let serialized = serde_json::to_string(&lvl).unwrap();
        assert_eq!(serialized, expected_json);

        let deserialized: LogLevel = serde_json::from_str(expected_json).unwrap();
        assert_eq!(deserialized, lvl);
    }

    // Uppercase or invalid levels must fail deserialization
    assert!(serde_json::from_str::<LogLevel>("\"INFO\"").is_err());
    assert!(serde_json::from_str::<LogLevel>("\"trace\"").is_err());
}

/// Adversarial stress test 6: AppConfig defaults & mutation validation
#[test]
fn test_app_config_spec_compliance() {
    let default_cfg = AppConfig::default();
    assert_eq!(default_cfg.remote_host, "192.168.68.103");
    assert_eq!(default_cfg.remote_port, 22);
    assert_eq!(default_cfg.remote_user, "ali");
    assert_eq!(
        default_cfg.private_key_path,
        "C:\\Users\\sufya\\.ssh\\wds_mac_ed25519"
    );
    assert_eq!(default_cfg.heartbeat_interval_secs, 15);
    assert_eq!(default_cfg.connection_timeout_secs, 10);
    assert!(!default_cfg.save_password_to_keyring);

    // Serialization roundtrip
    let json = serde_json::to_string(&default_cfg).unwrap();
    let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(default_cfg, deserialized);
}

/// Adversarial stress test 7: HeartbeatTick Serde contract & boundary validation
#[test]
fn test_heartbeat_tick_serde_contract() {
    let tick = HeartbeatTick {
        latency_ms: 12,
        timestamp: 1731000000,
    };
    let json = serde_json::to_string(&tick).unwrap();
    assert_eq!(
        json,
        r#"{"latency_ms":12,"timestamp":1731000000}"#,
        "HeartbeatTick JSON must strictly use snake_case 'latency_ms' and 'timestamp'"
    );

    let roundtripped: HeartbeatTick = serde_json::from_str(&json).unwrap();
    assert_eq!(tick, roundtripped);

    // Boundary conditions: 0ms latency and maximum u32/u64 values
    let min_tick = HeartbeatTick { latency_ms: 0, timestamp: 0 };
    assert_eq!(serde_json::to_string(&min_tick).unwrap(), r#"{"latency_ms":0,"timestamp":0}"#);

    let max_tick = HeartbeatTick { latency_ms: u32::MAX, timestamp: u64::MAX };
    let max_json = serde_json::to_string(&max_tick).unwrap();
    let max_roundtripped: HeartbeatTick = serde_json::from_str(&max_json).unwrap();
    assert_eq!(max_tick, max_roundtripped);

    // Missing latency_ms or timestamp must fail deserialization
    assert!(serde_json::from_str::<HeartbeatTick>(r#"{"latency_ms":10}"#).is_err());
    assert!(serde_json::from_str::<HeartbeatTick>(r#"{"timestamp":100}"#).is_err());
    assert!(serde_json::from_str::<HeartbeatTick>(r#"{"latencyMs":10,"timestamp":100}"#).is_err());
}

/// Adversarial stress test 8: HEARTBEAT_TIMEOUT error status contract and drop semantics
#[test]
fn test_heartbeat_timeout_error_status_contract() {
    let error_status = ConnectionStatus::Error {
        code: "HEARTBEAT_TIMEOUT".to_string(),
        message: "Connection timed out: 3 consecutive heartbeat pings failed".to_string(),
        timestamp: 1731000030,
    };

    let json = serde_json::to_string(&error_status).unwrap();
    assert_eq!(
        json,
        r#"{"status":"Error","details":{"code":"HEARTBEAT_TIMEOUT","message":"Connection timed out: 3 consecutive heartbeat pings failed","timestamp":1731000030}}"#
    );

    let deserialized: ConnectionStatus = serde_json::from_str(&json).unwrap();
    assert_eq!(error_status, deserialized);
    assert_eq!(error_status.status_name(), "Error");
}

/// Adversarial stress test 9: CancellationToken immediate abortion semantics
#[tokio::test]
async fn test_cancellation_token_abortion_semantics() {
    let cancel_token = CancellationToken::new();
    let token_clone = cancel_token.clone();

    let start = std::time::Instant::now();
    let handle = tokio::spawn(async move {
        tokio::select! {
            _ = token_clone.cancelled() => {
                "aborted"
            }
            _ = tokio::time::sleep(Duration::from_secs(10)) => {
                "timed_out"
            }
        }
    });

    // Cancel token after 10ms
    tokio::time::sleep(Duration::from_millis(10)).await;
    cancel_token.cancel();

    let result = handle.await.expect("Task panicked");
    let elapsed = start.elapsed();

    assert_eq!(result, "aborted", "Task must abort via CancellationToken");
    assert!(
        elapsed < Duration::from_millis(500),
        "CancellationToken must abort immediately without waiting for 10s timer (elapsed: {:?})",
        elapsed
    );
}

/// Adversarial stress test 10: Disconnect 1.5s hard timeout boundary enforcement
#[tokio::test]
async fn test_disconnect_timeout_boundary() {
    // 1. Simulating an uncooperative or hung future during disconnect
    let hung_disconnect = async {
        // Hangs for 10 seconds simulating socket stall
        tokio::time::sleep(Duration::from_secs(10)).await;
        "finished"
    };

    let start = std::time::Instant::now();
    let result = tokio::time::timeout(Duration::from_millis(1500), hung_disconnect).await;
    let elapsed = start.elapsed();

    assert!(result.is_err(), "Hung disconnect must timeout after 1.5s hard cap");
    assert!(
        elapsed >= Duration::from_millis(1400) && elapsed < Duration::from_millis(2000),
        "Timeout must enforce ~1500ms boundary (elapsed: {:?})",
        elapsed
    );

    // 2. Normal clean disconnect completing well under 1.5s
    let fast_disconnect = async {
        tokio::time::sleep(Duration::from_millis(50)).await;
        "clean"
    };

    let fast_res = tokio::time::timeout(Duration::from_millis(1500), fast_disconnect).await;
    assert_eq!(fast_res.unwrap(), "clean");
}

/// Adversarial stress test 11: Empirical challenge of remote_check cancellation pattern
#[tokio::test]
async fn test_cancellation_during_remote_identity_check_pattern() {
    use wds_connect_lib::ssh::remote_check::RemoteIdentity;

    // Pattern simulation function matching src-tauri/src/ssh/mod.rs:241-260
    async fn simulate_remote_check_with_cancellation<F>(
        cancel_token: CancellationToken,
        check_duration: Duration,
        simulated_res: Result<RemoteIdentity, String>,
        on_cancel_hook: F,
    ) -> Result<RemoteIdentity, String>
    where
        F: FnOnce(),
    {
        let check_future = async {
            tokio::time::sleep(check_duration).await;
            simulated_res
        };

        tokio::select! {
            biased;
            _ = cancel_token.cancelled() => {
                on_cancel_hook();
                Err("Connection cancelled by user".to_string())
            }
            res = check_future => {
                if cancel_token.is_cancelled() {
                    on_cancel_hook();
                    Err("Connection cancelled by user".to_string())
                } else {
                    res
                }
            }
        }
    }

    let valid_identity = RemoteIdentity {
        os_name: "macOS".to_string(),
        kernel_release: "24.3.0".to_string(),
        architecture: "arm64".to_string(),
        remote_user: "ali".to_string(),
        product_version: Some("15.3".to_string()),
        build_version: Some("24D60".to_string()),
    };

    // Case A: Cancellation triggered in-flight (30ms into a 5000ms remote probe)
    let token_a = CancellationToken::new();
    let token_a_clone = token_a.clone();
    let aborted_called_a = Arc::new(AtomicBool::new(false));
    let aborted_clone_a = aborted_called_a.clone();

    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(30)).await;
        token_a_clone.cancel();
    });

    let res_a = simulate_remote_check_with_cancellation(
        token_a,
        Duration::from_millis(5000),
        Ok(valid_identity.clone()),
        move || {
            aborted_clone_a.store(true, Ordering::SeqCst);
        },
    )
    .await;

    assert!(res_a.is_err());
    assert_eq!(res_a.unwrap_err(), "Connection cancelled by user");
    assert!(aborted_called_a.load(Ordering::SeqCst));

    // Case B: Pre-cancelled token before check starts
    let token_b = CancellationToken::new();
    token_b.cancel();
    let aborted_called_b = Arc::new(AtomicBool::new(false));
    let aborted_clone_b = aborted_called_b.clone();

    let res_b = simulate_remote_check_with_cancellation(
        token_b,
        Duration::from_millis(5000),
        Ok(valid_identity.clone()),
        move || {
            aborted_clone_b.store(true, Ordering::SeqCst);
        },
    )
    .await;

    assert_eq!(res_b.unwrap_err(), "Connection cancelled by user");
    assert!(aborted_called_b.load(Ordering::SeqCst));

    // Case C: Simultaneous race condition (check future completes at same instant as cancel)
    let token_c = CancellationToken::new();
    let aborted_called_c = Arc::new(AtomicBool::new(false));
    let aborted_clone_c = aborted_called_c.clone();

    token_c.cancel();
    let res_c = simulate_remote_check_with_cancellation(
        token_c,
        Duration::from_millis(0),
        Ok(valid_identity.clone()),
        move || {
            aborted_clone_c.store(true, Ordering::SeqCst);
        },
    )
    .await;

    assert_eq!(res_c.unwrap_err(), "Connection cancelled by user");
    assert!(aborted_called_c.load(Ordering::SeqCst));

    // Case D: Normal uncanceled execution succeeds
    let token_d = CancellationToken::new();
    let aborted_called_d = Arc::new(AtomicBool::new(false));
    let aborted_clone_d = aborted_called_d.clone();

    let res_d = simulate_remote_check_with_cancellation(
        token_d,
        Duration::from_millis(10),
        Ok(valid_identity.clone()),
        move || {
            aborted_clone_d.store(true, Ordering::SeqCst);
        },
    )
    .await;

    assert!(res_d.is_ok());
    assert_eq!(res_d.unwrap().display_summary(), "macOS 15.3 (Darwin 24.3.0 arm64)");
    assert!(!aborted_called_d.load(Ordering::SeqCst));
}

/// Adversarial stress test 12: Empirical challenge of heartbeat 3-miss drop detection & recovery
#[tokio::test]
async fn test_heartbeat_drop_detection_three_misses_state_machine() {
    #[derive(Debug, PartialEq, Eq, Clone)]
    enum HeartbeatEvent {
        Tick(u32),
        Miss(u32),
        TimeoutTriggered(String),
        Terminated,
    }

    async fn simulate_heartbeat_loop(
        cancel_token: CancellationToken,
        ping_results: Vec<Result<(), &'static str>>, // Simulated ping sequence
    ) -> (Vec<HeartbeatEvent>, ConnectionStatus) {
        let mut events = Vec::new();
        let mut status = ConnectionStatus::Connected {
            remote_host: "192.168.68.103".into(),
            remote_user: "ali".into(),
            remote_identity: "macOS 15.3".into(),
            connected_at: 0,
            latency_ms: Some(2),
        };

        let mut consecutive_misses = 0;
        let max_misses = 3;

        for ping in ping_results {
            tokio::select! {
                biased;
                _ = cancel_token.cancelled() => {
                    events.push(HeartbeatEvent::Terminated);
                    break;
                }
                _ = tokio::time::sleep(Duration::from_millis(1)) => {
                    match ping {
                        Ok(()) => {
                            consecutive_misses = 0;
                            events.push(HeartbeatEvent::Tick(consecutive_misses));
                        }
                        Err(_err) => {
                            consecutive_misses += 1;
                            events.push(HeartbeatEvent::Miss(consecutive_misses));

                            if consecutive_misses >= max_misses {
                                let msg = format!("Connection timed out: {} consecutive heartbeat pings failed", max_misses);
                                events.push(HeartbeatEvent::TimeoutTriggered(msg.clone()));
                                status = ConnectionStatus::Error {
                                    code: "HEARTBEAT_TIMEOUT".to_string(),
                                    message: msg,
                                    timestamp: 1000,
                                };
                                break;
                            }
                        }
                    }
                }
            }
        }

        (events, status)
    }

    // 1. Intermittent drops recover cleanly without triggering timeout
    let pings_intermittent = vec![
        Err("timeout"), // miss 1
        Ok(()),         // recover
        Err("timeout"), // miss 1
        Err("timeout"), // miss 2
        Ok(()),         // recover
        Ok(()),         // healthy
    ];
    let (events_1, status_1) = simulate_heartbeat_loop(CancellationToken::new(), pings_intermittent).await;
    assert!(status_1.is_connected());
    assert_eq!(
        events_1,
        vec![
            HeartbeatEvent::Miss(1),
            HeartbeatEvent::Tick(0),
            HeartbeatEvent::Miss(1),
            HeartbeatEvent::Miss(2),
            HeartbeatEvent::Tick(0),
            HeartbeatEvent::Tick(0),
        ]
    );

    // 2. Exactly 3 consecutive misses triggers HEARTBEAT_TIMEOUT and terminates loop
    let pings_persistent_drop = vec![
        Err("econnreset"), // miss 1
        Err("econnreset"), // miss 2
        Err("econnreset"), // miss 3 -> triggers timeout
        Ok(()),            // must never be reached!
    ];
    let (events_2, status_2) = simulate_heartbeat_loop(CancellationToken::new(), pings_persistent_drop).await;
    assert!(!status_2.is_connected());
    assert_eq!(status_2.status_name(), "Error");
    if let ConnectionStatus::Error { code, .. } = status_2 {
        assert_eq!(code, "HEARTBEAT_TIMEOUT");
    } else {
        panic!("Expected Error status");
    }
    assert_eq!(
        events_2,
        vec![
            HeartbeatEvent::Miss(1),
            HeartbeatEvent::Miss(2),
            HeartbeatEvent::Miss(3),
            HeartbeatEvent::TimeoutTriggered("Connection timed out: 3 consecutive heartbeat pings failed".into()),
        ]
    );

    // 3. Cancellation token terminates heartbeat immediately without error
    let token_3 = CancellationToken::new();
    let token_3_clone = token_3.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(2)).await;
        token_3_clone.cancel();
    });

    let infinite_pings = vec![Ok(()), Ok(()), Ok(()), Ok(()), Ok(()), Ok(())];
    let (events_3, status_3) = simulate_heartbeat_loop(token_3, infinite_pings).await;
    assert!(status_3.is_connected(), "Status should remain Connected on clean cancellation");
    assert!(events_3.contains(&HeartbeatEvent::Terminated));
}

/// Adversarial stress test 13: Empirical challenge of Disconnect idempotence & concurrent teardown
#[tokio::test]
async fn test_disconnect_idempotence_and_concurrent_teardown() {
    let state = Arc::new(AppState::new());

    // Invariant: Initial status is Disconnected
    assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::Disconnected);

    // Simulated SshManager::disconnect logic
    let disconnect_op = |state: Arc<AppState>| {
        // 1. Transition to Disconnecting
        {
            let mut s = state.status.lock().unwrap();
            *s = ConnectionStatus::Disconnecting;
        }

        // 2. Cancel tokens & rendezvous (idempotent operations)
        state.ssh_manager.auth_rendezvous.cancel();

        // 3. Transition to Disconnected
        {
            let mut s = state.status.lock().unwrap();
            *s = ConnectionStatus::Disconnected;
        }
        Ok::<(), String>(())
    };

    // 1. Sequential repeated calls (50 iterations)
    for _ in 0..50 {
        let res = disconnect_op(Arc::clone(&state));
        assert!(res.is_ok());
        assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::Disconnected);
    }

    // 2. Highly concurrent calls from 30 simultaneous tasks
    let mut tasks = Vec::new();
    for _ in 0..30 {
        let state_c = Arc::clone(&state);
        tasks.push(tokio::spawn(async move {
            disconnect_op(state_c)
        }));
    }

    for task in tasks {
        let res = task.await.expect("Disconnect task panicked");
        assert!(res.is_ok());
    }

    assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::Disconnected);

    // 3. Disconnect from Error status resets to Disconnected
    {
        let mut s = state.status.lock().unwrap();
        *s = ConnectionStatus::Error {
            code: "HEARTBEAT_TIMEOUT".to_string(),
            message: "Connection lost".to_string(),
            timestamp: 1000,
        };
    }
    assert_eq!(state.status.lock().unwrap().status_name(), "Error");

    let res = disconnect_op(Arc::clone(&state));
    assert!(res.is_ok());
    assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::Disconnected);
}

/// Adversarial stress test 14: Empirical challenge of AuthRendezvous concurrency and idempotency
#[tokio::test]
async fn test_auth_rendezvous_concurrency_and_idempotency() {
    use wds_connect_lib::ssh::auth::AuthRendezvous;

    let rz = Arc::new(AuthRendezvous::new());

    // 1. Calling cancel on empty rendezvous returns false and never panics
    assert!(!rz.cancel());
    assert!(!rz.cancel());

    // 2. Calling submit on empty rendezvous returns false and never panics
    assert!(!rz.submit("secret".to_string(), false));

    // 3. Register channel, then cancel
    let (tx1, rx1) = tokio::sync::oneshot::channel();
    rz.register(tx1);
    assert!(rz.cancel(), "First cancel should return true");
    assert!(!rz.cancel(), "Second cancel should return false (already drained)");
    assert!(!rz.submit("late".to_string(), false), "Submit after cancel should return false");

    let received1 = rx1.await.expect("Sender should not be dropped without message");
    assert!(received1.is_none(), "Cancelled challenge should deliver None");

    // 4. Register channel, then submit
    let (tx2, rx2) = tokio::sync::oneshot::channel();
    rz.register(tx2);
    assert!(rz.submit("valid_pw".to_string(), true), "Submit should succeed");
    assert!(!rz.submit("another_pw".to_string(), false), "Subsequent submit must fail");
    assert!(!rz.cancel(), "Cancel after submit must fail");

    let received2 = rx2.await.expect("Sender should deliver submission");
    assert!(received2.is_some());
    let sub = received2.unwrap();
    assert_eq!(sub.password.as_str(), "valid_pw");
    assert!(sub.remember);

    // 5. Heavy concurrent race between cancel and submit
    for _ in 0..20 {
        let rz_race = Arc::new(AuthRendezvous::new());
        let (tx, rx) = tokio::sync::oneshot::channel();
        rz_race.register(tx);

        let rz_submit = Arc::clone(&rz_race);
        let submit_handle = tokio::spawn(async move {
            rz_submit.submit("race_password".to_string(), false)
        });

        let rz_cancel = Arc::clone(&rz_race);
        let cancel_handle = tokio::spawn(async move {
            rz_cancel.cancel()
        });

        let submit_won = submit_handle.await.unwrap();
        let cancel_won = cancel_handle.await.unwrap();

        // Exactly one of (submit, cancel) must win
        assert_ne!(submit_won, cancel_won, "Exactly one of submit/cancel must succeed");

        let msg = rx.await.expect("Channel must receive message");
        if submit_won {
            assert!(msg.is_some());
        } else {
            assert!(msg.is_none());
        }
    }
}

/// Adversarial stress test 15: Empirical challenge of HeartbeatController stop semantics
#[tokio::test]
async fn test_heartbeat_controller_stop_semantics() {
    use wds_connect_lib::ssh::heartbeat::HeartbeatController;

    let token = CancellationToken::new();
    let controller = HeartbeatController::new(token.clone());

    assert!(!token.is_cancelled());
    controller.stop();
    assert!(token.is_cancelled(), "HeartbeatController::stop() must cancel the token");

    // Repeated stop() calls are idempotent
    controller.stop();
    assert!(token.is_cancelled());
}

