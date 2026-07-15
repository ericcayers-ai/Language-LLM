//! Desktop manager helpers: disk estimates, log redaction, native-host repair,
//! hardware probe, backend discovery, and signed-update metadata (no private keys).

#![cfg_attr(not(feature = "gui"), allow(dead_code))]

use inference_router::{probe_profile, ModelManager};
use language_llm_protocol::HardwareProfile;
use local_store::{PrivacyWipeScope, RetentionPreset, SqliteStore};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::CompanionState;

/// Public updater verification key placeholder. Release CI substitutes the real
/// pubkey via `TAURI_SIGNING_PUBLIC_KEY` / repo secrets — never commit private keys.
pub const UPDATER_PUBLIC_KEY_PLACEHOLDER: &str = "UNCONFIGURED_UPDATER_PUBLIC_KEY";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSnapshot {
    pub service_running: bool,
    pub port: u16,
    pub protocol_version: String,
    pub extension_id_pinned: bool,
    pub allowed_extension_id: Option<String>,
    pub data_dir: String,
    pub sqlite_ready: bool,
    pub model_catalog_ready: bool,
    pub active_sessions: usize,
    pub job_count: usize,
    pub lyrics_network_allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskEstimate {
    pub data_dir_bytes: u64,
    pub sqlite_bytes: u64,
    pub models_bytes: u64,
    pub total_bytes: u64,
    pub paths: Vec<DiskPathEstimate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskPathEstimate {
    pub label: String,
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSnapshot {
    pub ram_gb: u32,
    pub vram_gb: u32,
    pub recommended_profile: HardwareProfile,
    pub selected_profile: HardwareProfile,
    pub backends: Vec<BackendDiscovery>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendDiscovery {
    pub name: String,
    pub kind: String,
    pub available: bool,
    pub path: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHostRepairResult {
    pub ok: bool,
    pub extension_id: String,
    pub manifest_path: Option<String>,
    pub wrapper_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub configured: bool,
    pub pubkey_configured: bool,
    pub endpoints: Vec<String>,
    pub current_version: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSnapshot {
    pub retention: String,
    pub disk: DiskEstimate,
    pub dictionary_count: usize,
    pub dictionary_entries: usize,
    pub lyrics_network_allowed: bool,
}

#[derive(Debug, Default)]
pub struct LogBuffer {
    lines: Mutex<Vec<String>>,
    capacity: usize,
}

impl LogBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            lines: Mutex::new(Vec::new()),
            capacity: capacity.max(64),
        }
    }

    pub fn push(&self, line: impl Into<String>) {
        let mut guard = self.lines.lock().unwrap();
        guard.push(line.into());
        let overflow = guard.len().saturating_sub(self.capacity);
        if overflow > 0 {
            guard.drain(0..overflow);
        }
    }

    pub fn snapshot(&self) -> Vec<String> {
        self.lines.lock().unwrap().clone()
    }
}

/// Redact tokens, bearer-like secrets, and session IDs from log/export text.
pub fn redact_sensitive(text: &str) -> String {
    let mut out = text.to_string();
    for key in [
        "bootstrapToken",
        "bootstrap_token",
        "sessionToken",
        "session_token",
        "Authorization",
        "Bearer ",
    ] {
        // Collapse value after key separators.
        if let Some(idx) = out.find(key) {
            let rest = &out[idx + key.len()..];
            let end = rest.find([',', '"', '\n', ' ']).unwrap_or(rest.len());
            let start = idx + key.len();
            let replace_end = start + end;
            if replace_end > start {
                out.replace_range(start..replace_end, ":***");
            }
        }
    }
    // Hex tokens ≥ 32 chars
    let mut redacted = String::with_capacity(out.len());
    for token in out.split_whitespace() {
        if token.len() >= 32 && token.chars().all(|c| c.is_ascii_hexdigit()) {
            redacted.push_str("[redacted-hex]");
        } else {
            redacted.push_str(token);
        }
        redacted.push(' ');
    }
    redacted.trim_end().to_string()
}

pub fn dir_size_bytes(path: &Path) -> u64 {
    fn walk(p: &Path) -> u64 {
        let mut total = 0u64;
        let Ok(entries) = fs::read_dir(p) else {
            return 0;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                total = total.saturating_add(walk(&path));
            } else if let Ok(meta) = entry.metadata() {
                total = total.saturating_add(meta.len());
            }
        }
        total
    }
    if path.is_dir() {
        walk(path)
    } else if path.is_file() {
        fs::metadata(path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    }
}

pub fn estimate_disk(state: &CompanionState) -> DiskEstimate {
    let data_dir = state.data_dir.clone();
    let sqlite_bytes = state
        .sqlite
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|db| db.database_disk_bytes()))
        .unwrap_or(0);
    let models_bytes = state
        .model_manager
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|m| m.weights_disk_bytes()))
        .unwrap_or_else(|| dir_size_bytes(&data_dir.join("models")));
    let data_dir_bytes = dir_size_bytes(&data_dir);
    let paths = vec![
        DiskPathEstimate {
            label: "Data directory".into(),
            path: data_dir.display().to_string(),
            bytes: data_dir_bytes,
        },
        DiskPathEstimate {
            label: "SQLite store".into(),
            path: data_dir.join("local-store.sqlite").display().to_string(),
            bytes: sqlite_bytes,
        },
        DiskPathEstimate {
            label: "Model weights".into(),
            path: data_dir
                .join("models")
                .join("weights")
                .display()
                .to_string(),
            bytes: models_bytes,
        },
    ];
    DiskEstimate {
        data_dir_bytes,
        sqlite_bytes,
        models_bytes,
        total_bytes: data_dir_bytes.max(sqlite_bytes.saturating_add(models_bytes)),
        paths,
    }
}

pub fn health_snapshot(state: &CompanionState, service_running: bool) -> HealthSnapshot {
    let sessions = state.sessions.lock().map(|s| s.len()).unwrap_or(0);
    let jobs = state.jobs.lock().map(|j| j.len()).unwrap_or(0);
    let sqlite_ready = state.sqlite.lock().map(|g| g.is_some()).unwrap_or(false);
    let model_catalog_ready = state
        .model_manager
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    HealthSnapshot {
        service_running,
        port: state.port(),
        protocol_version: language_llm_protocol::PROTOCOL_VERSION.to_string(),
        extension_id_pinned: state.allowed_extension_id().is_some(),
        allowed_extension_id: state.allowed_extension_id(),
        data_dir: state.data_dir.display().to_string(),
        sqlite_ready,
        model_catalog_ready,
        active_sessions: sessions,
        job_count: jobs,
        lyrics_network_allowed: state.lyrics_network_allowed(),
    }
}

pub fn detect_ram_gb() -> u32 {
    #[cfg(target_os = "windows")]
    {
        // Best-effort via wmic; fall back to 16.
        if let Ok(out) = Command::new("wmic")
            .args(["ComputerSystem", "get", "TotalPhysicalMemory", "/value"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if let Some(v) = line.strip_prefix("TotalPhysicalMemory=") {
                    if let Ok(bytes) = v.trim().parse::<u64>() {
                        return ((bytes / (1024 * 1024 * 1024)) as u32).max(1);
                    }
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(text) = fs::read_to_string("/proc/meminfo") {
            for line in text.lines() {
                if let Some(rest) = line.strip_prefix("MemTotal:") {
                    let kb: u64 = rest
                        .split_whitespace()
                        .next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    if kb > 0 {
                        return ((kb / (1024 * 1024)) as u32).max(1);
                    }
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = Command::new("sysctl").args(["-n", "hw.memsize"]).output() {
            if let Ok(bytes) = String::from_utf8_lossy(&out.stdout).trim().parse::<u64>() {
                return ((bytes / (1024 * 1024 * 1024)) as u32).max(1);
            }
        }
    }
    16
}

pub fn hardware_snapshot(selected: HardwareProfile, model_root: &Path) -> HardwareSnapshot {
    let ram_gb = detect_ram_gb();
    let vram_gb = 0; // GPU probe deferred; CPU-only estimate remains truthful.
    let recommended = probe_profile(ram_gb, vram_gb);
    let backends = discover_backends(model_root);
    HardwareSnapshot {
        ram_gb,
        vram_gb,
        recommended_profile: recommended,
        selected_profile: selected,
        backends,
        notes: "VRAM probe is not yet wired; profile recommendation uses system RAM only.".into(),
    }
}

pub fn discover_backends(model_root: &Path) -> Vec<BackendDiscovery> {
    let bin_dir = model_root.join("models").join("bin");
    let mut out = Vec::new();
    for (name, kind, candidates) in [
        (
            "whisper.cpp",
            "asr",
            &[
                "whisper-cli",
                "whisper-cli.exe",
                "main",
                "main.exe",
                "whisper",
                "whisper.exe",
            ][..],
        ),
        (
            "llama.cpp",
            "mt/vlm",
            &[
                "llama-cli",
                "llama-cli.exe",
                "llama-server",
                "llama-server.exe",
                "main",
                "main.exe",
            ][..],
        ),
    ] {
        let found = candidates
            .iter()
            .map(|c| bin_dir.join(c))
            .find(|p| p.is_file());
        out.push(BackendDiscovery {
            name: name.into(),
            kind: kind.into(),
            available: found.is_some(),
            path: found.as_ref().map(|p| p.display().to_string()),
            detail: if found.is_some() {
                "CLI binary found under models/bin".into()
            } else {
                format!("Place {} under {}", candidates[0], bin_dir.display())
            },
        });
    }
    out.push(BackendDiscovery {
        name: "Offline mock".into(),
        kind: "fallback".into(),
        available: true,
        path: None,
        detail: "Always available when verified weights are absent".into(),
    });
    out
}

pub fn pin_extension_id(data_dir: &Path, extension_id: &str) -> Result<PathBuf, String> {
    let id = extension_id.trim();
    if id.is_empty() || id.len() < 16 {
        return Err("extension id looks invalid".into());
    }
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let path = data_dir.join("extension_id");
    fs::write(&path, format!("{id}\n")).map_err(|e| e.to_string())?;
    Ok(path)
}

/// One-action native-host registration repair (writes manifest + OS registration).
pub fn repair_native_host(
    extension_id: &str,
    binary_path: &Path,
    data_dir: &Path,
) -> NativeHostRepairResult {
    let extension_id = extension_id.trim().to_string();
    if extension_id.is_empty() {
        return NativeHostRepairResult {
            ok: false,
            extension_id,
            manifest_path: None,
            wrapper_path: None,
            message: "Extension ID required to repair native-host registration".into(),
        };
    }
    if let Err(e) = pin_extension_id(data_dir, &extension_id) {
        return NativeHostRepairResult {
            ok: false,
            extension_id,
            manifest_path: None,
            wrapper_path: None,
            message: format!("Failed to pin extension id: {e}"),
        };
    }

    match write_native_host_registration(&extension_id, binary_path) {
        Ok((manifest, wrapper)) => NativeHostRepairResult {
            ok: true,
            extension_id,
            manifest_path: Some(manifest.display().to_string()),
            wrapper_path: Some(wrapper.display().to_string()),
            message: "Native messaging host re-registered. Reload the extension if the ID changed."
                .into(),
        },
        Err(e) => NativeHostRepairResult {
            ok: false,
            extension_id,
            manifest_path: None,
            wrapper_path: None,
            message: e,
        },
    }
}

fn write_native_host_registration(
    extension_id: &str,
    binary_path: &Path,
) -> Result<(PathBuf, PathBuf), String> {
    let host_name = "com.languagellm.companion";
    let origin = format!("chrome-extension://{extension_id}/");

    #[cfg(target_os = "windows")]
    {
        let manifest_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LanguageLLM");
        fs::create_dir_all(&manifest_dir).map_err(|e| e.to_string())?;
        let wrapper = manifest_dir.join("language-llm-native-host.cmd");
        let wrapper_body = format!(
            "@echo off\r\nset LANGUAGE_LLM_NATIVE=1\r\n\"{}\" --native-messaging\r\n",
            binary_path.display()
        );
        fs::write(&wrapper, wrapper_body).map_err(|e| e.to_string())?;
        let manifest = manifest_dir.join(format!("{host_name}.json"));
        let body = serde_json::json!({
            "name": host_name,
            "description": "Language-LLM local companion bootstrap",
            "path": wrapper,
            "type": "stdio",
            "allowed_origins": [origin],
        });
        fs::write(
            &manifest,
            serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let reg = format!(r#"HKCU\Software\Google\Chrome\NativeMessagingHosts\{host_name}"#);
        let status = Command::new("reg")
            .args([
                "add",
                &reg,
                "/ve",
                "/t",
                "REG_SZ",
                "/d",
                &manifest.display().to_string(),
                "/f",
            ])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to write Chrome native messaging registry key".into());
        }
        Ok((manifest, wrapper))
    }

    #[cfg(target_os = "macos")]
    {
        let support = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LanguageLLM");
        fs::create_dir_all(&support).map_err(|e| e.to_string())?;
        let wrapper = support.join("language-llm-native-host");
        let wrapper_body = format!(
            "#!/bin/sh\nexport LANGUAGE_LLM_NATIVE=1\nexec \"{}\" --native-messaging\n",
            binary_path.display()
        );
        fs::write(&wrapper, wrapper_body).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755));
        }
        let nm_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Library/Application Support/Google/Chrome/NativeMessagingHosts");
        fs::create_dir_all(&nm_dir).map_err(|e| e.to_string())?;
        let manifest = nm_dir.join(format!("{host_name}.json"));
        let body = serde_json::json!({
            "name": host_name,
            "description": "Language-LLM local companion bootstrap",
            "path": wrapper,
            "type": "stdio",
            "allowed_origins": [origin],
        });
        fs::write(
            &manifest,
            serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        return Ok((manifest, wrapper));
    }

    #[cfg(target_os = "linux")]
    {
        let data = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("language-llm");
        fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        let wrapper = data.join("language-llm-native-host");
        let wrapper_body = format!(
            "#!/bin/sh\nexport LANGUAGE_LLM_NATIVE=1\nexec \"{}\" --native-messaging\n",
            binary_path.display()
        );
        fs::write(&wrapper, wrapper_body).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&wrapper, fs::Permissions::from_mode(0o755));
        }
        let nm_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("google-chrome/NativeMessagingHosts");
        fs::create_dir_all(&nm_dir).map_err(|e| e.to_string())?;
        let manifest = nm_dir.join(format!("{host_name}.json"));
        let body = serde_json::json!({
            "name": host_name,
            "description": "Language-LLM local companion bootstrap",
            "path": wrapper,
            "type": "stdio",
            "allowed_origins": [origin],
        });
        fs::write(
            &manifest,
            serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        return Ok((manifest, wrapper));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = (extension_id, binary_path, host_name, origin);
        Err("Native-host repair is not supported on this OS".into())
    }
}

pub fn update_status(current_version: &str) -> UpdateStatus {
    let pubkey = std::env::var("TAURI_SIGNING_PUBLIC_KEY")
        .ok()
        .filter(|s| !s.is_empty() && s != UPDATER_PUBLIC_KEY_PLACEHOLDER);
    let endpoints = vec![
        "https://github.com/language-llm/language-llm/releases/latest/download/latest.json".into(),
    ];
    let configured = pubkey.is_some();
    UpdateStatus {
        configured,
        pubkey_configured: configured,
        endpoints,
        current_version: current_version.to_string(),
        message: if configured {
            "Updater public key present. Release artifacts are verified with the public key only; private signing keys stay in CI secrets."
                .into()
        } else {
            "Updater not configured for this build. Set TAURI_SIGNING_PUBLIC_KEY in release CI; private keys must never ship in the app."
                .into()
        },
    }
}

pub fn storage_snapshot(state: &CompanionState) -> StorageSnapshot {
    let retention = state
        .sqlite
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref()
                .and_then(|db| db.get_retention_preset().ok())
                .map(|p| p.as_str().to_string())
        })
        .unwrap_or_else(|| RetentionPreset::Days7.as_str().to_string());
    let (dictionary_count, dictionary_entries) = state
        .sqlite
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|db| db.dictionary_stats().ok()))
        .unwrap_or((0, 0));
    StorageSnapshot {
        retention,
        disk: estimate_disk(state),
        dictionary_count,
        dictionary_entries,
        lyrics_network_allowed: state.lyrics_network_allowed(),
    }
}

pub fn apply_retention(state: &CompanionState, preset: &str) -> Result<String, String> {
    let preset =
        RetentionPreset::parse(preset).ok_or_else(|| "unknown retention preset".to_string())?;
    let guard = state.sqlite.lock().map_err(|e| e.to_string())?;
    let db: &SqliteStore = guard
        .as_ref()
        .ok_or_else(|| "sqlite store unavailable".to_string())?;
    db.set_retention_preset(preset).map_err(|e| e.to_string())?;
    Ok(preset.as_str().to_string())
}

pub fn privacy_wipe(state: &CompanionState, scope: &str) -> Result<serde_json::Value, String> {
    let scope =
        PrivacyWipeScope::parse(scope).ok_or_else(|| "unknown privacy wipe scope".to_string())?;
    let guard = state.sqlite.lock().map_err(|e| e.to_string())?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "sqlite store unavailable".to_string())?;
    let cleared = db.privacy_wipe(scope).map_err(|e| e.to_string())?;
    if matches!(scope, PrivacyWipeScope::All | PrivacyWipeScope::Lyrics) {
        let _ = state.clear_lyrics_cache(None);
    }
    if matches!(scope, PrivacyWipeScope::All) {
        if let Ok(mut mem) = state.memory.lock() {
            mem.clear_all();
        }
    }
    Ok(serde_json::json!({ "cleared": cleared }))
}

pub fn export_logs_redacted(buffer: &LogBuffer, dest: &Path) -> Result<PathBuf, String> {
    let lines = buffer.snapshot();
    let mut body = String::from("# Language-LLM diagnostics export (redacted)\n");
    if lines.is_empty() {
        body.push_str("(no buffered log lines)\n");
    } else {
        for line in lines {
            body.push_str(&redact_sensitive(&line));
            body.push('\n');
        }
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, body).map_err(|e| e.to_string())?;
    Ok(dest.to_path_buf())
}

pub fn model_root_for(state: &CompanionState) -> PathBuf {
    state
        .model_manager
        .lock()
        .ok()
        .and_then(|g| {
            g.as_ref().map(|m| {
                m.paths
                    .catalog_path
                    .parent()
                    .and_then(|p| p.parent())
                    .unwrap_or(&state.data_dir)
                    .to_path_buf()
            })
        })
        .unwrap_or_else(|| state.data_dir.clone())
}

pub fn with_models<T>(
    state: &CompanionState,
    f: impl FnOnce(&ModelManager) -> T,
) -> Result<T, String> {
    let guard = state.model_manager.lock().map_err(|e| e.to_string())?;
    let mgr = guard
        .as_ref()
        .ok_or_else(|| "model catalog unavailable".to_string())?;
    Ok(f(mgr))
}

/// Shared runtime for the GUI: companion authority + service lifecycle + logs.
pub struct ManagerRuntime {
    pub state: Arc<CompanionState>,
    pub service_running: Mutex<bool>,
    pub selected_profile: Mutex<HardwareProfile>,
    pub logs: LogBuffer,
    pub ws_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl ManagerRuntime {
    pub fn new(state: Arc<CompanionState>) -> Arc<Self> {
        Arc::new(Self {
            state,
            service_running: Mutex::new(false),
            selected_profile: Mutex::new(HardwareProfile::Balanced),
            logs: LogBuffer::new(2000),
            ws_handle: Mutex::new(None),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_tokens_and_hex() {
        let raw = r#"bootstrapToken:aabbccddeeff00112233445566778899 session Token deadbeefdeadbeefdeadbeefdeadbeef"#;
        let out = redact_sensitive(raw);
        assert!(out.contains("***") || out.contains("[redacted-hex]"));
        assert!(!out.contains("aabbccddeeff00112233445566778899"));
    }

    #[test]
    fn update_status_without_key() {
        std::env::remove_var("TAURI_SIGNING_PUBLIC_KEY");
        let s = update_status("0.1.0");
        assert!(!s.configured);
        assert!(s.message.contains("private keys"));
    }
}
