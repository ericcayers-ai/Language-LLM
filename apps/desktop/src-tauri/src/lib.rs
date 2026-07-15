//! Tauri companion: native messaging bootstrap + loopback WebSocket authority
//! + optional desktop manager GUI (`gui` feature).

#![deny(unsafe_code)]

mod jobs;
mod manager;
mod native_host;
mod service;
mod ws_server;

#[cfg(feature = "gui")]
mod commands;

use inference_router::{digests_match, sha256_file, ModelManager};
use language_llm_protocol::{
    make_handshake_response, versions_compatible, AuthHandshakeRequest, PROTOCOL_VERSION,
};
use local_store::{
    lyrics_cache_key, page_translate_cache_key, MemoryStore, RetentionPreset, SqliteStore,
};
use media_pipeline::CaptureJobQueue;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub use inference_router::{
    default_asr_model_id, mock_translate_line, plan_asr_job, probe_profile, select_models,
    AsrBackendKind, AsrJobPayload, InferenceMode, ModelCatalog, ModelPaths, WhisperCppBackend,
    WhisperStub,
};
pub use media_pipeline::{energy_vad_chunks, resample_linear, PcmMono, TARGET_SAMPLE_RATE_HZ};
pub use subtitle_core::{to_lrc, to_srt, to_vtt};

pub use jobs::JobRegistry;
pub use manager::{
    redact_sensitive, repair_native_host, update_status, ManagerRuntime,
    UPDATER_PUBLIC_KEY_PLACEHOLDER,
};
pub use native_host::run_native_messaging;
pub use service::{is_running as service_is_running, start_service, stop_service};
pub use ws_server::bind_loopback_server;

pub fn companion_protocol_version() -> &'static str {
    PROTOCOL_VERSION
}

pub fn validate_handshake_version(req: &AuthHandshakeRequest) -> bool {
    versions_compatible(&req.protocol_version, PROTOCOL_VERSION)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub ok: bool,
    pub port: u16,
    pub bootstrap_token: String,
    pub protocol_version: String,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
    pub expires_at_ms: u64,
    pub extension_id: String,
}

pub struct CompanionState {
    port: AtomicU16,
    bootstrap_token: Mutex<String>,
    /// Pinned Chrome extension ID (`LANGUAGE_LLM_EXTENSION_ID` or `data_dir/extension_id`).
    allowed_extension_id: Mutex<Option<String>>,
    pub sessions: Mutex<Vec<Session>>,
    pub memory: Mutex<MemoryStore>,
    pub sqlite: Mutex<Option<SqliteStore>>,
    pub capture: Mutex<CaptureJobQueue>,
    pub jobs: Mutex<JobRegistry>,
    pub model_manager: Mutex<Option<ModelManager>>,
    pub data_dir: PathBuf,
    /// When true, companion may call LRCLIB (user opted in). Default false.
    pub lyrics_network_allowed: Mutex<bool>,
}

const HANDSHAKE_MAX_SKEW_MS: u64 = 120_000;
const SESSION_TTL_MS: u64 = 30 * 60 * 1000;

pub fn load_allowed_extension_id(data_dir: &std::path::Path) -> Option<String> {
    if let Ok(id) = std::env::var("LANGUAGE_LLM_EXTENSION_ID") {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return Some(id);
        }
    }
    let config_path = data_dir.join("extension_id");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let id = content.trim().to_string();
        if !id.is_empty() {
            return Some(id);
        }
    }
    None
}

impl CompanionState {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        let bootstrap_token = random_token(32);
        let allowed_extension_id = load_allowed_extension_id(&data_dir);
        if allowed_extension_id.is_none() {
            if cfg!(not(debug_assertions)) {
                tracing::warn!(
                    "LANGUAGE_LLM_EXTENSION_ID not set; release builds require extension pin"
                );
            } else {
                tracing::warn!(
                    "extension id not pinned; accepting any extension in debug (set LANGUAGE_LLM_EXTENSION_ID)"
                );
            }
        }
        let sqlite = SqliteStore::open(data_dir.join("local-store.sqlite")).ok();
        let model_manager = ModelManager::try_from_root(discover_repo_or_data_root(&data_dir)).ok();
        Arc::new(Self {
            port: AtomicU16::new(0),
            bootstrap_token: Mutex::new(bootstrap_token),
            allowed_extension_id: Mutex::new(allowed_extension_id),
            sessions: Mutex::new(Vec::new()),
            memory: Mutex::new(MemoryStore::default()),
            sqlite: Mutex::new(sqlite),
            capture: Mutex::new(CaptureJobQueue::default()),
            jobs: Mutex::new(JobRegistry::default()),
            model_manager: Mutex::new(model_manager),
            data_dir,
            lyrics_network_allowed: Mutex::new(false),
        })
    }

    /// Unit-test helper without binding or disk.
    pub fn new_random_port_placeholder() -> Self {
        Self {
            port: AtomicU16::new(0),
            bootstrap_token: Mutex::new(Uuid::new_v4().simple().to_string()),
            allowed_extension_id: Mutex::new(None),
            sessions: Mutex::new(Vec::new()),
            memory: Mutex::new(MemoryStore::default()),
            sqlite: Mutex::new(None),
            capture: Mutex::new(CaptureJobQueue::default()),
            jobs: Mutex::new(JobRegistry::default()),
            model_manager: Mutex::new(None),
            data_dir: PathBuf::from("."),
            lyrics_network_allowed: Mutex::new(false),
        }
    }

    pub fn allowed_extension_id(&self) -> Option<String> {
        self.allowed_extension_id
            .lock()
            .ok()
            .and_then(|g| g.clone())
    }

    pub fn set_allowed_extension_id(&self, id: Option<String>) {
        if let Ok(mut g) = self.allowed_extension_id.lock() {
            *g = id;
        }
    }

    pub fn bootstrap_token(&self) -> String {
        self.bootstrap_token.lock().unwrap().clone()
    }

    pub fn validate_bootstrap_token(&self, token: &str) -> bool {
        *self.bootstrap_token.lock().unwrap() == token
    }

    pub fn rotate_bootstrap_token(&self) {
        *self.bootstrap_token.lock().unwrap() = random_token(32);
    }

    pub fn origin_allowed(&self, origin: &str) -> bool {
        if origin == "http://127.0.0.1" || origin == "https://127.0.0.1" {
            return true;
        }
        if let Some(allowed) = self.allowed_extension_id() {
            return origin == format!("chrome-extension://{allowed}");
        }
        #[cfg(debug_assertions)]
        if origin.starts_with("chrome-extension://") {
            tracing::warn!("accepting chrome-extension origin without pin: {origin}");
            return true;
        }
        false
    }

    pub fn extension_id_allowed(&self, extension_id: &str) -> Result<(), &'static str> {
        if extension_id.is_empty() {
            return Err("extension id empty");
        }
        match self.allowed_extension_id() {
            Some(allowed) if allowed == extension_id => Ok(()),
            Some(_) => Err("extension id not allowlisted"),
            None => {
                if cfg!(not(debug_assertions)) {
                    Err("extension id pin required in release builds")
                } else {
                    tracing::warn!("accepting extension {extension_id} without pin (debug only)");
                    Ok(())
                }
            }
        }
    }

    pub fn validate_handshake_timestamp(&self, requested_at_ms: u64, now_ms: u64) -> bool {
        requested_at_ms.abs_diff(now_ms) <= HANDSHAKE_MAX_SKEW_MS
    }

    pub fn purge_expired_sessions(&self, now_ms: u64) {
        self.sessions
            .lock()
            .unwrap()
            .retain(|s| s.expires_at_ms > now_ms);
    }

    pub fn port(&self) -> u16 {
        self.port.load(Ordering::SeqCst)
    }

    pub fn set_port(&self, port: u16) {
        self.port.store(port, Ordering::SeqCst);
    }

    pub fn bootstrap(&self) -> BootstrapResponse {
        BootstrapResponse {
            ok: true,
            port: self.port(),
            bootstrap_token: self.bootstrap_token(),
            protocol_version: PROTOCOL_VERSION.to_string(),
        }
    }

    pub fn issue_session(&self, extension_id: &str, now_ms: u64) -> Session {
        self.purge_expired_sessions(now_ms);
        let session = Session {
            token: random_token(32),
            expires_at_ms: now_ms + SESSION_TTL_MS,
            extension_id: extension_id.to_string(),
        };
        self.sessions.lock().unwrap().push(session.clone());
        session
    }

    pub fn session_valid(&self, token: &str, now_ms: u64) -> bool {
        self.purge_expired_sessions(now_ms);
        self.sessions
            .lock()
            .unwrap()
            .iter()
            .any(|s| s.token == token && s.expires_at_ms > now_ms)
    }

    pub fn handshake_json(&self, extension_id: &str, now_ms: u64) -> String {
        let session = self.issue_session(extension_id, now_ms);
        let msg =
            make_handshake_response(session.token, session.expires_at_ms, Some("0.1.0".into()));
        serde_json::to_string(&msg).expect("handshake serialize")
    }

    #[allow(clippy::too_many_arguments)]
    pub fn cache_page_segment(
        &self,
        canonical_url: &str,
        model_id: &str,
        rev: &str,
        src: &str,
        tgt: &str,
        hash: &str,
        value: &str,
    ) {
        let key = page_translate_cache_key(canonical_url, model_id, rev, src, tgt, hash);
        self.memory
            .lock()
            .unwrap()
            .put(key.clone(), value.to_string());
        if let Ok(guard) = self.sqlite.lock() {
            if let Some(db) = guard.as_ref() {
                let _ =
                    db.put_page_segment(&key, canonical_url, model_id, rev, src, tgt, hash, value);
            }
        }
    }

    pub fn cache_lyrics(&self, video_id: &str, source: &str, body: &str, attribution: &str) {
        let key = lyrics_cache_key(&video_id.to_string(), source);
        self.memory.lock().unwrap().put_lyrics(
            key.clone(),
            body.to_string(),
            attribution.to_string(),
        );
        if let Ok(guard) = self.sqlite.lock() {
            if let Some(db) = guard.as_ref() {
                let _ = db.put_lyrics(&key, video_id, source, body, attribution);
            }
        }
    }

    pub fn clear_lyrics_cache(&self, video_id: Option<&str>) -> usize {
        let prefix = match video_id {
            Some(v) => format!("lyrics|{v}|"),
            None => "lyrics|".to_string(),
        };
        let n = self.memory.lock().unwrap().clear_prefix(&prefix);
        if let Ok(guard) = self.sqlite.lock() {
            if let Some(db) = guard.as_ref() {
                return db.clear_lyrics_prefix(&prefix).unwrap_or(n);
            }
        }
        n
    }

    pub fn set_lyrics_network_allowed(&self, allowed: bool) {
        *self.lyrics_network_allowed.lock().unwrap() = allowed;
    }

    pub fn lyrics_network_allowed(&self) -> bool {
        *self.lyrics_network_allowed.lock().unwrap()
    }
}

pub fn default_retention() -> RetentionPreset {
    RetentionPreset::Days7
}

/// SHA-256 hex verification hook for model downloads.
pub fn verify_sha256_hex(expected: &str, actual: &str) -> bool {
    digests_match(expected, actual)
}

pub fn verify_file_sha256(path: impl AsRef<std::path::Path>, expected: &str) -> bool {
    match sha256_file(path) {
        Ok(actual) => digests_match(expected, &actual),
        Err(_) => false,
    }
}

pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    for chunk in buf.chunks_mut(16) {
        let u = Uuid::new_v4();
        let b = u.as_bytes();
        for (i, slot) in chunk.iter_mut().enumerate() {
            *slot = b[i % 16];
        }
    }
    hex::encode(buf)
}

pub fn default_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("language-llm")
}

fn discover_repo_or_data_root(data_dir: &std::path::Path) -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cwd.join("models").join("catalog.json").is_file() {
        return cwd;
    }
    if data_dir.join("models").join("catalog.json").is_file() {
        return data_dir.to_path_buf();
    }
    data_dir.to_path_buf()
}

/// Documented install paths (see models/README.md).
pub const DOCUMENTED_WEIGHTS_LAYOUT: &str = r#"
models/catalog.json                 signed-ready catalog
models/weights/<model-id>/          verified weight files
models/weights/<model-id>/.installed  written after SHA-256 match
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_and_cache() {
        let state = CompanionState::new_random_port_placeholder();
        let b = state.bootstrap();
        assert!(b.ok);
        assert_eq!(b.protocol_version, PROTOCOL_VERSION);
        state.cache_page_segment("https://a", "hy", "1", "en", "ja", "h", "こんにちは");
        state.cache_lyrics("vid", "lrclib", "[00:01.00]hi", "LRCLIB");
        assert_eq!(state.clear_lyrics_cache(Some("vid")), 1);
        let digest = inference_router::sha256_hex(b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assert_eq!(digest.len(), 64);
        assert!(verify_sha256_hex(&digest, &digest));
        assert!(!verify_sha256_hex(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        ));
        let _ = inference_router::normalize_digest("sha256:abc");
        let _ = ModelPaths::from_root(".");
        assert!(!DOCUMENTED_WEIGHTS_LAYOUT.is_empty());
    }

    #[test]
    fn handshake_auth_helpers() {
        let state = CompanionState::new_random_port_placeholder();
        let now = 1_700_000_000_000u64;
        assert!(state.validate_handshake_timestamp(now, now));
        assert!(!state.validate_handshake_timestamp(now, now + 200_000));
        assert!(state.extension_id_allowed("test-ext-id").is_ok());
        assert!(state.origin_allowed("http://127.0.0.1"));
        assert!(!state.origin_allowed("https://evil.example"));
        let token1 = state.bootstrap_token();
        state.rotate_bootstrap_token();
        assert_ne!(state.bootstrap_token(), token1);
    }
}

/// Run the Tauri desktop manager (requires `gui` feature).
#[cfg(feature = "gui")]
pub fn run_desktop_manager() {
    let data_dir = std::env::var("LANGUAGE_LLM_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_data_dir());
    let _ = std::fs::create_dir_all(&data_dir);
    let state = CompanionState::new(data_dir);
    let runtime = ManagerRuntime::new(Arc::clone(&state));

    let runtime_setup = Arc::clone(&runtime);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(runtime)
        .setup(move |app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;
            use tauri::Manager;

            let show_i = MenuItem::with_id(app, "show", "Open Manager", true, None::<&str>)?;
            let start_i = MenuItem::with_id(app, "start", "Start Service", true, None::<&str>)?;
            let stop_i = MenuItem::with_id(app, "stop", "Stop Service", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &start_i, &stop_i, &quit_i])?;

            let runtime_tray = Arc::clone(&runtime_setup);
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Language-LLM Companion")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "start" => {
                        let rt = Arc::clone(&runtime_tray);
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::service::start_service(rt).await;
                        });
                    }
                    "stop" => {
                        let _ = crate::service::stop_service(&runtime_tray);
                    }
                    "quit" => {
                        let _ = crate::service::stop_service(&runtime_tray);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Auto-start loopback service when the manager opens.
            let rt = Arc::clone(&runtime_setup);
            tauri::async_runtime::spawn(async move {
                match crate::service::start_service(rt).await {
                    Ok(port) => tracing::info!("manager auto-started service on {port}"),
                    Err(e) => tracing::error!("manager failed to start service: {e}"),
                }
            });
            Ok(())
        });

    let builder = commands::register_commands(builder);
    builder
        .run(tauri::generate_context!())
        .expect("error while running Language-LLM desktop manager");
}
