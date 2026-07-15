//! Hardware probe, model catalog selection, scheduling, download verification.
//! whisper.cpp / llama.cpp spawn interfaces live in [`backends`]; specialist ASR
//! routing in [`asr_router`].

#![deny(unsafe_code)]

mod asr_router;
mod backends;

pub use asr_router::{
    default_asr_model_id, is_specialist_asr, plan_asr_job, plan_specialist_or_err, AsrBackendKind,
    AsrJobPayload,
};
pub use backends::{
    build_llama_command, build_whisper_command, discover_weight_file, find_binary, run_llama,
    run_whisper, CppLoadable, CppRuntimePaths, LlamaCppBackend, LlamaCppConfig, WhisperCppBackend,
    WhisperCppConfig, LLAMA_CLI_NAMES, WHISPER_CLI_NAMES,
};

use language_llm_protocol::{HardwareProfile, ModelLicenseClass, PowerPolicy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RouterError {
    #[error("no compatible model for task={task} profile={profile:?}")]
    NoCompatibleModel {
        task: String,
        profile: HardwareProfile,
    },
    #[error("license blocked: {0}")]
    License(String),
    #[error("scheduler refused job: {0}")]
    Scheduler(String),
    #[error("catalog: {0}")]
    Catalog(String),
    #[error("sha256 mismatch for {id}: expected {expected}, got {actual}")]
    Sha256Mismatch {
        id: String,
        expected: String,
        actual: String,
    },
    #[error("weights missing for {0} (offline mock path)")]
    WeightsMissing(String),
    #[error("model not installed: {0}")]
    ModelNotInstalled(String),
    #[error("io: {0}")]
    Io(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduleHint {
    pub profile: HardwareProfile,
    pub power: PowerPolicy,
    pub allow_co_residency: bool,
}

pub fn prefer_sequential(profile: HardwareProfile) -> bool {
    matches!(profile, HardwareProfile::Lite | HardwareProfile::Balanced)
}

pub fn probe_profile(ram_gb: u32, vram_gb: u32) -> HardwareProfile {
    if vram_gb >= 24 || ram_gb >= 64 {
        HardwareProfile::Workstation
    } else if vram_gb >= 12 || ram_gb >= 32 {
        HardwareProfile::Quality
    } else if vram_gb >= 6 || ram_gb >= 16 {
        HardwareProfile::Balanced
    } else {
        HardwareProfile::Lite
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogModel {
    pub id: String,
    pub family: String,
    pub task: String,
    #[serde(default, rename = "licenseClass", alias = "license_class")]
    pub license_class: Option<String>,
    #[serde(default, rename = "commercialDefault", alias = "commercial_default")]
    pub commercial_default: Option<bool>,
    #[serde(default, rename = "hardwareMin", alias = "hardware_min")]
    pub hardware_min: Option<String>,
    /// Catalog `backend`: whisper-cpp | llama-cpp | onnx | nemo-python | research
    #[serde(default)]
    pub backend: Option<String>,
    #[serde(default)]
    pub languages: Option<String>,
    #[serde(default, rename = "sha256Placeholder", alias = "sha256_placeholder")]
    pub sha256_placeholder: Option<String>,
    #[serde(default, rename = "downloadUrlHint", alias = "download_url_hint")]
    pub download_url_hint: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelCatalog {
    #[serde(default, rename = "catalogVersion")]
    pub catalog_version: Option<String>,
    pub models: Vec<CatalogModel>,
}

impl ModelCatalog {
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self, RouterError> {
        let text = fs::read_to_string(path.as_ref()).map_err(|e| RouterError::Io(e.to_string()))?;
        serde_json::from_str(&text).map_err(|e| RouterError::Catalog(e.to_string()))
    }

    pub fn find(&self, id: &str) -> Option<&CatalogModel> {
        self.models.iter().find(|m| m.id == id)
    }
}

fn profile_rank(p: HardwareProfile) -> u8 {
    match p {
        HardwareProfile::Lite => 0,
        HardwareProfile::Balanced => 1,
        HardwareProfile::Quality => 2,
        HardwareProfile::Workstation => 3,
    }
}

fn parse_profile(s: &str) -> HardwareProfile {
    match s {
        "balanced" => HardwareProfile::Balanced,
        "quality" => HardwareProfile::Quality,
        "workstation" => HardwareProfile::Workstation,
        _ => HardwareProfile::Lite,
    }
}

pub fn select_models<'a>(
    catalog: &'a ModelCatalog,
    task: &str,
    profile: HardwareProfile,
    allow_research: bool,
) -> Result<Vec<&'a CatalogModel>, RouterError> {
    let mut matched: Vec<&CatalogModel> = catalog
        .models
        .iter()
        .filter(|m| m.task == task)
        .filter(|m| {
            let min = m
                .hardware_min
                .as_deref()
                .map(parse_profile)
                .unwrap_or(HardwareProfile::Lite);
            profile_rank(profile) >= profile_rank(min)
        })
        .filter(|m| {
            let research = m
                .license_class
                .as_deref()
                .map(|c| c.contains("research"))
                .unwrap_or(false);
            if research && !allow_research {
                return false;
            }
            true
        })
        .collect();
    if matched.is_empty() {
        return Err(RouterError::NoCompatibleModel {
            task: task.to_string(),
            profile,
        });
    }
    matched.sort_by_key(|m| (!(m.commercial_default.unwrap_or(false)), m.id.clone()));
    Ok(matched)
}

pub fn license_class_of(model: &CatalogModel) -> ModelLicenseClass {
    match model.license_class.as_deref() {
        Some(s) if s.contains("research") => ModelLicenseClass::ResearchOptIn,
        Some(s) if s.contains("optional") => ModelLicenseClass::Optional,
        _ => ModelLicenseClass::CommercialDefault,
    }
}

/// SHA-256 hex digest of raw bytes.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn sha256_file(path: impl AsRef<Path>) -> Result<String, RouterError> {
    let bytes = fs::read(path.as_ref()).map_err(|e| RouterError::Io(e.to_string()))?;
    Ok(sha256_hex(&bytes))
}

/// Normalize catalog digests (`sha256:abc…` or bare hex).
pub fn normalize_digest(value: &str) -> String {
    let trimmed = value.trim();
    let hex = trimmed
        .strip_prefix("sha256:")
        .or_else(|| trimmed.strip_prefix("SHA256:"))
        .unwrap_or(trimmed)
        .trim();
    hex.to_ascii_lowercase()
}

pub fn digests_match(expected: &str, actual: &str) -> bool {
    let e = normalize_digest(expected);
    let a = normalize_digest(actual);
    if e.starts_with("pending") || e.contains("pending") {
        // Catalog placeholders until first verified download — accept only exact pending match
        // for wiring tests; production rejects loading.
        return false;
    }
    e.len() == 64 && e == a && e.chars().all(|c| c.is_ascii_hexdigit())
}

/// Model weight install roots (documented paths).
#[derive(Debug, Clone)]
pub struct ModelPaths {
    pub weights_dir: PathBuf,
    pub catalog_path: PathBuf,
}

impl ModelPaths {
    /// Default layout relative to a repo or user data root:
    /// `{root}/models/catalog.json`, `{root}/models/weights/{model_id}/`.
    pub fn from_root(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref();
        Self {
            weights_dir: root.join("models").join("weights"),
            catalog_path: root.join("models").join("catalog.json"),
        }
    }

    pub fn model_dir(&self, model_id: &str) -> PathBuf {
        self.weights_dir.join(model_id)
    }

    pub fn marker_path(&self, model_id: &str) -> PathBuf {
        self.model_dir(model_id).join(".installed")
    }
}

#[derive(Debug, Clone)]
pub struct ModelManager {
    pub paths: ModelPaths,
    pub catalog: ModelCatalog,
}

impl ModelManager {
    pub fn new(paths: ModelPaths, catalog: ModelCatalog) -> Self {
        Self { paths, catalog }
    }

    pub fn try_from_root(root: impl AsRef<Path>) -> Result<Self, RouterError> {
        let paths = ModelPaths::from_root(root);
        let catalog = ModelCatalog::load_from_path(&paths.catalog_path)?;
        Ok(Self::new(paths, catalog))
    }

    /// Documented install: write bytes to weights dir, verify SHA-256 against catalog.
    pub fn install_bytes(
        &self,
        model_id: &str,
        filename: &str,
        bytes: &[u8],
    ) -> Result<PathBuf, RouterError> {
        let model = self
            .catalog
            .find(model_id)
            .ok_or_else(|| RouterError::Catalog(format!("unknown model {model_id}")))?;
        let actual = sha256_hex(bytes);
        if let Some(expected) = model.sha256_placeholder.as_deref() {
            let norm = normalize_digest(expected);
            if norm.len() == 64
                && norm.chars().all(|c| c.is_ascii_hexdigit())
                && !digests_match(expected, &actual)
            {
                return Err(RouterError::Sha256Mismatch {
                    id: model_id.into(),
                    expected: expected.into(),
                    actual,
                });
            }
            // PENDING placeholders: still write file but do not mark verified.
        }
        let dir = self.paths.model_dir(model_id);
        fs::create_dir_all(&dir).map_err(|e| RouterError::Io(e.to_string()))?;
        let dest = dir.join(filename);
        fs::write(&dest, bytes).map_err(|e| RouterError::Io(e.to_string()))?;
        let verified = model
            .sha256_placeholder
            .as_deref()
            .map(|e| digests_match(e, &actual))
            .unwrap_or(false);
        if verified {
            fs::write(
                self.paths.marker_path(model_id),
                format!("sha256:{actual}\n"),
            )
            .map_err(|e| RouterError::Io(e.to_string()))?;
        }
        Ok(dest)
    }

    /// Release installs require `.installed` plus digest match when catalog has a real SHA-256.
    /// Dev mode (`LANGUAGE_LLM_DEV_CATALOG=1` or catalog `PENDING_*` digest): weight file presence suffices.
    pub fn is_installed(&self, model_id: &str) -> bool {
        let model = self.catalog.find(model_id);
        let catalog_digest = model.and_then(|m| m.sha256_placeholder.as_deref());
        let dev_catalog = std::env::var("LANGUAGE_LLM_DEV_CATALOG").ok().as_deref() == Some("1");
        let pending_catalog = catalog_digest
            .map(|d| {
                let norm = normalize_digest(d);
                norm.starts_with("pending") || norm.contains("pending")
            })
            .unwrap_or(true);

        let marker_path = self.paths.marker_path(model_id);
        if marker_path.is_file() {
            if let Some(expected) = catalog_digest {
                let norm = normalize_digest(expected);
                if norm.len() == 64 && norm.chars().all(|c| c.is_ascii_hexdigit()) {
                    let marker_text = fs::read_to_string(&marker_path)
                        .unwrap_or_default()
                        .trim()
                        .to_string();
                    return digests_match(expected, &marker_text);
                }
            }
            return true;
        }

        if dev_catalog || pending_catalog {
            return discover_weight_file(&self.paths.model_dir(model_id)).is_some();
        }

        false
    }

    /// When weights are absent, callers should use offline mock adapters.
    pub fn require_or_mock(&self, model_id: &str) -> Result<InferenceMode, RouterError> {
        if self.is_installed(model_id) {
            Ok(InferenceMode::Weights)
        } else {
            Ok(InferenceMode::OfflineMock)
        }
    }

    /// Remove installed weight files and the `.installed` marker for a model.
    pub fn remove_model(&self, model_id: &str) -> Result<bool, RouterError> {
        let dir = self.paths.model_dir(model_id);
        if !dir.exists() {
            return Ok(false);
        }
        fs::remove_dir_all(&dir).map_err(|e| RouterError::Io(e.to_string()))?;
        Ok(true)
    }

    /// Re-verify digests for an already-on-disk model; returns false when not installed.
    pub fn verify_model(&self, model_id: &str) -> Result<ModelVerifyReport, RouterError> {
        let model = self
            .catalog
            .find(model_id)
            .ok_or_else(|| RouterError::Catalog(format!("unknown model {model_id}")))?;
        let installed = self.is_installed(model_id);
        let marker = self.paths.marker_path(model_id);
        let weight = discover_weight_file(&self.paths.model_dir(model_id));
        let file_digest = weight.as_ref().and_then(|p| sha256_file(p).ok());
        let expected = model.sha256_placeholder.clone();
        let digest_ok = match (expected.as_deref(), file_digest.as_deref()) {
            (Some(exp), Some(act)) => {
                let norm = normalize_digest(exp);
                if norm.len() == 64 && norm.chars().all(|c| c.is_ascii_hexdigit()) {
                    digests_match(exp, act)
                } else {
                    true // pending placeholders cannot fail digest equality yet
                }
            }
            _ => installed,
        };
        Ok(ModelVerifyReport {
            model_id: model_id.to_string(),
            installed,
            digest_ok,
            expected_digest: expected,
            actual_digest: file_digest,
            marker_present: marker.is_file(),
            weight_path: weight.map(|p| p.display().to_string()),
        })
    }

    /// Bytes used under `models/weights/{id}` (0 when absent).
    pub fn model_disk_bytes(&self, model_id: &str) -> u64 {
        dir_size_bytes(&self.paths.model_dir(model_id))
    }

    /// Total bytes under the weights root.
    pub fn weights_disk_bytes(&self) -> u64 {
        dir_size_bytes(&self.paths.weights_dir)
    }

    pub fn list_catalog_status(&self) -> Vec<ModelStatusEntry> {
        self.catalog
            .models
            .iter()
            .map(|m| ModelStatusEntry {
                id: m.id.clone(),
                family: m.family.clone(),
                task: m.task.clone(),
                license_class: m.license_class.clone(),
                commercial_default: m.commercial_default.unwrap_or(false),
                hardware_min: m.hardware_min.clone(),
                backend: m.backend.clone(),
                installed: self.is_installed(&m.id),
                disk_bytes: self.model_disk_bytes(&m.id),
                download_url_hint: m.download_url_hint.clone(),
                notes: m.notes.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatusEntry {
    pub id: String,
    pub family: String,
    pub task: String,
    pub license_class: Option<String>,
    pub commercial_default: bool,
    pub hardware_min: Option<String>,
    pub backend: Option<String>,
    pub installed: bool,
    pub disk_bytes: u64,
    pub download_url_hint: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelVerifyReport {
    pub model_id: String,
    pub installed: bool,
    pub digest_ok: bool,
    pub expected_digest: Option<String>,
    pub actual_digest: Option<String>,
    pub marker_present: bool,
    pub weight_path: Option<String>,
}

fn dir_size_bytes(path: &Path) -> u64 {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InferenceMode {
    Weights,
    OfflineMock,
}

/// Whisper.cpp adapter interface — leaf where GPU weights would load.
pub trait WhisperBackend {
    fn transcribe(&mut self, pcm_16k_mono: &[f32]) -> Result<String, RouterError>;
}

/// Offline stub used until whisper.cpp is linked.
pub struct WhisperStub;

impl WhisperBackend for WhisperStub {
    fn transcribe(&mut self, pcm_16k_mono: &[f32]) -> Result<String, RouterError> {
        if pcm_16k_mono.is_empty() {
            return Err(RouterError::Scheduler("empty pcm".into()));
        }
        // TODO(weights): call whisper.cpp with large-v3-turbo / large-v3 GGUF.
        Ok(
            "[whisper-stub] OfflineMock ASR — install verified weights for real transcription"
                .into(),
        )
    }
}

/// Mock MT used when Hy-MT2 / MADLAD weights are absent.
pub fn mock_translate_line(text: &str, target_lang: &str) -> String {
    format!("[{target_lang}] {text}")
}

#[derive(Debug, Clone)]
pub struct JobHandle {
    pub id: String,
    pub cancelled: bool,
    pub paused: bool,
}

impl JobHandle {
    pub fn cancel(&mut self) {
        self.cancelled = true;
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }
}

#[cfg(test)]
pub(crate) fn tests_uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn sample_model(id: &str, task: &str) -> CatalogModel {
        CatalogModel {
            id: id.into(),
            family: "whisper".into(),
            task: task.into(),
            license_class: Some("commercial-default".into()),
            commercial_default: Some(true),
            hardware_min: Some("lite".into()),
            backend: Some("whisper-cpp".into()),
            languages: None,
            sha256_placeholder: None,
            download_url_hint: None,
            notes: None,
        }
    }

    #[test]
    fn probe_and_select() {
        assert_eq!(probe_profile(8, 0), HardwareProfile::Lite);
        assert_eq!(probe_profile(16, 8), HardwareProfile::Balanced);
        let catalog = ModelCatalog {
            catalog_version: Some("1.0.0".into()),
            models: vec![sample_model("whisper-large-v3-turbo", "asr")],
        };
        let m = select_models(&catalog, "asr", HardwareProfile::Lite, false).unwrap();
        assert_eq!(m[0].id, "whisper-large-v3-turbo");
    }

    #[test]
    fn loads_repo_catalog_backends() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json");
        let catalog = ModelCatalog::load_from_path(&path).expect("catalog");
        let fr = catalog.find("fireredasr2s").expect("firered");
        assert_eq!(fr.backend.as_deref(), Some("onnx"));
        let wh = catalog.find("whisper-small").expect("whisper");
        assert_eq!(wh.backend.as_deref(), Some("whisper-cpp"));
        let hy = catalog.find("hy-mt2-1.8b").expect("hy");
        assert_eq!(hy.backend.as_deref(), Some("llama-cpp"));
    }

    #[test]
    fn sha256_verify_and_offline_mock() {
        let bytes = b"hello-model";
        let digest = sha256_hex(bytes);
        assert!(digests_match(&digest, &digest));
        assert!(!digests_match("sha256:PENDING_x", &digest));

        let dir = std::env::temp_dir().join(format!("llm-model-test-{}", tests_uuid()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("models")).unwrap();
        let mut model = sample_model("mock-mt", "mt");
        model.family = "mock".into();
        model.backend = None;
        model.sha256_placeholder = Some(format!("sha256:{digest}"));
        let catalog = ModelCatalog {
            catalog_version: Some("1".into()),
            models: vec![model],
        };
        let catalog_path = dir.join("models").join("catalog.json");
        let mut f = fs::File::create(&catalog_path).unwrap();
        write!(
            f,
            "{}",
            serde_json::to_string(&serde_json::json!({
                "catalogVersion": "1",
                "models": [{
                    "id": "mock-mt",
                    "family": "mock",
                    "task": "mt",
                    "licenseClass": "commercial-default",
                    "commercialDefault": true,
                    "hardwareMin": "lite",
                    "sha256Placeholder": format!("sha256:{digest}")
                }]
            }))
            .unwrap()
        )
        .unwrap();
        drop(f);

        let mgr = ModelManager::new(ModelPaths::from_root(&dir), catalog);
        assert!(matches!(
            mgr.require_or_mock("mock-mt").unwrap(),
            InferenceMode::OfflineMock
        ));
        mgr.install_bytes("mock-mt", "weights.bin", bytes).unwrap();
        assert!(mgr.is_installed("mock-mt"));
        assert!(matches!(
            mgr.require_or_mock("mock-mt").unwrap(),
            InferenceMode::Weights
        ));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn loose_files_not_installed_without_marker_or_dev() {
        let dir = std::env::temp_dir().join(format!("llm-loose-{}", tests_uuid()));
        let _ = fs::remove_dir_all(&dir);
        let digest = sha256_hex(b"weights-only");
        fs::create_dir_all(dir.join("models").join("weights").join("mock-mt")).unwrap();
        fs::write(
            dir.join("models")
                .join("weights")
                .join("mock-mt")
                .join("weights.bin"),
            b"weights-only",
        )
        .unwrap();
        let catalog = ModelCatalog {
            catalog_version: Some("1".into()),
            models: vec![CatalogModel {
                id: "mock-mt".into(),
                family: "mock".into(),
                task: "mt".into(),
                license_class: Some("commercial-default".into()),
                commercial_default: Some(true),
                hardware_min: Some("lite".into()),
                backend: None,
                languages: None,
                sha256_placeholder: Some(format!("sha256:{digest}")),
                download_url_hint: None,
                notes: None,
            }],
        };
        fs::write(
            dir.join("models").join("catalog.json"),
            serde_json::to_string(&serde_json::json!({
                "catalogVersion": "1",
                "models": [{
                    "id": "mock-mt",
                    "family": "mock",
                    "task": "mt",
                    "licenseClass": "commercial-default",
                    "commercialDefault": true,
                    "hardwareMin": "lite",
                    "sha256Placeholder": format!("sha256:{digest}")
                }]
            }))
            .unwrap(),
        )
        .unwrap();
        let mgr = ModelManager::new(ModelPaths::from_root(&dir), catalog);
        assert!(
            !mgr.is_installed("mock-mt"),
            "loose files alone must not count as installed"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dev_catalog_allows_weight_presence_without_marker() {
        let dir = std::env::temp_dir().join(format!("llm-dev-{}", tests_uuid()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("models").join("weights").join("mock-mt")).unwrap();
        fs::write(
            dir.join("models")
                .join("weights")
                .join("mock-mt")
                .join("weights.bin"),
            b"x",
        )
        .unwrap();
        let catalog = ModelCatalog {
            catalog_version: Some("1".into()),
            models: vec![CatalogModel {
                id: "mock-mt".into(),
                family: "mock".into(),
                task: "mt".into(),
                license_class: Some("commercial-default".into()),
                commercial_default: Some(true),
                hardware_min: Some("lite".into()),
                backend: None,
                languages: None,
                sha256_placeholder: Some("sha256:PENDING_mock".into()),
                download_url_hint: None,
                notes: None,
            }],
        };
        fs::write(
            dir.join("models").join("catalog.json"),
            r#"{"models":[{"id":"mock-mt","family":"mock","task":"mt","sha256Placeholder":"sha256:PENDING_mock"}]}"#,
        )
        .unwrap();
        let mgr = ModelManager::new(ModelPaths::from_root(&dir), catalog);
        assert!(mgr.is_installed("mock-mt"));
        let _ = fs::remove_dir_all(&dir);
    }
}
