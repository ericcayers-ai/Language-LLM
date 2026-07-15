//! Tauri companion: native messaging bootstrap + loopback WebSocket authority.

#![deny(unsafe_code)]

mod jobs;
mod native_host;
mod ws_server;

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
pub use native_host::run_native_messaging;
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
    pub bootstrap_token: String,
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

impl CompanionState {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        let bootstrap_token = random_token(32);
        let sqlite = SqliteStore::open(data_dir.join("local-store.sqlite")).ok();
        let model_manager = ModelManager::try_from_root(discover_repo_or_data_root(&data_dir)).ok();
        Arc::new(Self {
            port: AtomicU16::new(0),
            bootstrap_token,
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
            bootstrap_token: Uuid::new_v4().simple().to_string(),
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
            bootstrap_token: self.bootstrap_token.clone(),
            protocol_version: PROTOCOL_VERSION.to_string(),
        }
    }

    pub fn issue_session(&self, extension_id: &str, now_ms: u64) -> Session {
        let session = Session {
            token: random_token(32),
            expires_at_ms: now_ms + 30 * 60 * 1000,
            extension_id: extension_id.to_string(),
        };
        self.sessions.lock().unwrap().push(session.clone());
        session
    }

    pub fn session_valid(&self, token: &str, now_ms: u64) -> bool {
        self.sessions
            .lock()
            .unwrap()
            .iter()
            .any(|s| s.token == token && s.expires_at_ms > now_ms)
    }

    pub fn handshake_json(&self, extension_id: &str, now_ms: u64) -> String {
        let session = self.issue_session(extension_id, now_ms);
        let msg = make_handshake_response(
            session.token,
            session.expires_at_ms,
            Some("0.1.0".into()),
        );
        serde_json::to_string(&msg).expect("handshake serialize")
    }

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
                let _ = db.put_page_segment(
                    &key,
                    canonical_url,
                    model_id,
                    rev,
                    src,
                    tgt,
                    hash,
                    value,
                );
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
}
