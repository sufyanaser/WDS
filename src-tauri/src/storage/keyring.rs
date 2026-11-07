//! OS Credential Storage via `keyring` (Windows Credential Manager & Apple Keychain)
//! Stores credentials securely under service `com.wds.connect` without plaintext leaks.

use keyring::Entry;
use zeroize::Zeroizing;

pub const KEYRING_SERVICE: &str = "com.wds.connect";

/// Formats the account key in accordance with E2E contracts and OpenSSH conventions:
/// e.g. "ali@192.168.68.103" for standard port 22, or "ali@192.168.68.103:2222" for custom ports.
pub fn format_account_id(user: &str, host: &str, port: u16) -> String {
    if port == 22 {
        format!("{}@{}", user, host)
    } else {
        format!("{}@{}:{}", user, host, port)
    }
}

/// Retrieves the stored password from the OS Credential Manager.
/// Returns Ok(Some(Zeroizing<String>)) if found, Ok(None) if NoEntry, or Err on OS vault failure.
pub fn get_saved_password(user: &str, host: &str, port: u16) -> Result<Option<Zeroizing<String>>, String> {
    let account = format_account_id(user, host, port);
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(pw) => Ok(Some(Zeroizing::new(pw))),
        Err(keyring::Error::NoEntry) => {
            // Also check legacy/fallback account format with explicit :22 if port is 22
            if port == 22 {
                let alt_account = format!("{}@{}:{}", user, host, port);
                if let Ok(alt_entry) = Entry::new(KEYRING_SERVICE, &alt_account) {
                    if let Ok(pw) = alt_entry.get_password() {
                        return Ok(Some(Zeroizing::new(pw)));
                    }
                }
            }
            Ok(None)
        }
        Err(e) => Err(format!("Keyring read error: {}", e)),
    }
}

/// Saves a password into the OS Credential Manager under the specified account.
pub fn save_password(user: &str, host: &str, port: u16, password: &str) -> Result<(), String> {
    let account = format_account_id(user, host, port);
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    entry.set_password(password).map_err(|e| e.to_string())?;
    Ok(())
}

/// Purges stored credentials for the target account from the OS Credential Manager.
/// If the credential does not exist (`NoEntry`), it succeeds gracefully.
pub fn delete_saved_password(user: &str, host: &str, port: u16) -> Result<(), String> {
    let account = format_account_id(user, host, port);
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;

    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Failed to delete credential: {}", e)),
    }

    // Also purge alternate account key if present
    if port == 22 {
        let alt_account = format!("{}@{}:{}", user, host, port);
        if let Ok(alt_entry) = Entry::new(KEYRING_SERVICE, &alt_account) {
            let _ = alt_entry.delete_credential();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_account_id() {
        assert_eq!(format_account_id("ali", "192.168.68.103", 22), "ali@192.168.68.103");
        assert_eq!(format_account_id("ali", "192.168.68.103", 2222), "ali@192.168.68.103:2222");
    }
}
