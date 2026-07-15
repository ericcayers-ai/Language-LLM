//! Catalog-driven ASR specialist router.
//!
//! Whisper / moonshine can fall back to offline mock when weights are absent.
//! Specialists (FireRedASR2S, Qwen3-ASR, Parakeet 0.6B v3, Canary-1B v2, …)
//! return [`RouterError::ModelNotInstalled`] instead of silent mock success.

use crate::{CatalogModel, InferenceMode, ModelManager, RouterError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Backend identifiers as used in `models/catalog.json` `backend` field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AsrBackendKind {
    WhisperCpp,
    LlamaCpp,
    Onnx,
    NemoPython,
    Research,
    #[serde(other)]
    Unknown,
}

impl AsrBackendKind {
    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "whisper-cpp" => Self::WhisperCpp,
            "llama-cpp" => Self::LlamaCpp,
            "onnx" => Self::Onnx,
            "nemo-python" => Self::NemoPython,
            "research" => Self::Research,
            _ => Self::Unknown,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::WhisperCpp => "whisper-cpp",
            Self::LlamaCpp => "llama-cpp",
            Self::Onnx => "onnx",
            Self::NemoPython => "nemo-python",
            Self::Research => "research",
            Self::Unknown => "unknown",
        }
    }

    /// Specialists must be installed; they never silently mock.
    pub fn requires_explicit_install(self) -> bool {
        matches!(
            self,
            Self::Onnx | Self::NemoPython | Self::Research | Self::LlamaCpp
        )
    }
}

/// Planned companion / worker job for ASR.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AsrJobPayload {
    pub model_id: String,
    pub family: String,
    pub backend: AsrBackendKind,
    pub mode: String,
    pub weight_path: Option<PathBuf>,
    pub sample_rate_hz: u32,
    pub languages_hint: Option<String>,
    pub notes: Option<String>,
}

impl AsrJobPayload {
    pub fn mode_enum(&self) -> InferenceMode {
        if self.mode == "Weights" {
            InferenceMode::Weights
        } else {
            InferenceMode::OfflineMock
        }
    }
}

fn backend_of(model: &CatalogModel) -> AsrBackendKind {
    model
        .backend
        .as_deref()
        .map(AsrBackendKind::parse)
        .unwrap_or(AsrBackendKind::Unknown)
}

/// Select default commercial ASR model for a hardware profile (existing catalog order).
pub fn default_asr_model_id(
    manager: &ModelManager,
    profile: language_llm_protocol::HardwareProfile,
    allow_research: bool,
) -> Result<String, RouterError> {
    let matched = crate::select_models(&manager.catalog, "asr", profile, allow_research)?;
    Ok(matched[0].id.clone())
}

/// Resolve an explicit model id into a job payload.
///
/// - `whisper-cpp` / `moonshine` (onnx commercial default): may return OfflineMock when absent.
/// - FireRed / Qwen3-ASR / Parakeet / Canary and other specialists: error if not installed.
pub fn plan_asr_job(manager: &ModelManager, model_id: &str) -> Result<AsrJobPayload, RouterError> {
    let model = manager
        .catalog
        .find(model_id)
        .ok_or_else(|| RouterError::Catalog(format!("unknown ASR model id: {model_id}")))?;
    if model.task != "asr" && model.task != "aligner" {
        return Err(RouterError::Catalog(format!(
            "model {model_id} task={} is not asr",
            model.task
        )));
    }

    let backend = backend_of(model);
    if matches!(backend, AsrBackendKind::Research) {
        return Err(RouterError::ModelNotInstalled(format!(
            "{model_id}: research / no deployable weights"
        )));
    }

    let installed = manager.is_installed(model_id);
    let weight_path = manager.discover_weights(model_id);
    let specialist = is_specialist_asr(&model.id, &model.family, backend);

    if specialist && !installed {
        return Err(RouterError::ModelNotInstalled(format!(
            "{model_id} ({}) is not installed under {}; place weights and re-verify SHA-256",
            backend.as_str(),
            manager.paths.model_dir(model_id).display()
        )));
    }

    let mode = if installed {
        InferenceMode::Weights
    } else {
        InferenceMode::OfflineMock
    };

    Ok(AsrJobPayload {
        model_id: model.id.clone(),
        family: model.family.clone(),
        backend,
        mode: format!("{mode:?}"),
        weight_path,
        sample_rate_hz: 16_000,
        languages_hint: model.languages.clone(),
        notes: model.notes.clone(),
    })
}

/// Known optional / specialist ASR packs that must not silently mock.
pub fn is_specialist_asr(model_id: &str, family: &str, backend: AsrBackendKind) -> bool {
    if backend.requires_explicit_install() && family != "moonshine" {
        // onnx moonshine is a lite commercial fallback that may mock.
        // All other onnx/nemo specialists require install.
        if family == "moonshine" {
            return false;
        }
        return true;
    }
    matches!(
        family,
        "fireredasr" | "qwen3-asr" | "parakeet" | "canary" | "canary-qwen" | "granite-speech"
    ) || matches!(
        model_id,
        "fireredasr2s"
            | "qwen3-asr-1.7b"
            | "qwen3-asr-0.6b"
            | "parakeet-tdt-0.6b-v3"
            | "parakeet-tdt-1.1b"
            | "canary-1b-v2"
            | "canary-qwen-2.5b"
            | "granite-speech-3.3-8b"
    )
}

/// Convenience: plan job for a specialist id or return the typed not-installed error.
pub fn plan_specialist_or_err(
    manager: &ModelManager,
    model_id: &str,
) -> Result<AsrJobPayload, RouterError> {
    plan_asr_job(manager, model_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ModelCatalog, ModelPaths};
    use language_llm_protocol::HardwareProfile;
    use std::fs;

    fn catalog_with_specialists() -> ModelCatalog {
        ModelCatalog::load_from_path(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json"),
        )
        .expect("repo catalog.json")
    }

    #[test]
    fn whisper_allows_offline_mock_when_absent() {
        let root = std::env::temp_dir().join(format!("asr-wh-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("models").join("weights")).unwrap();
        let catalog = catalog_with_specialists();
        // Copy catalog into temp root.
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json"),
            root.join("models").join("catalog.json"),
        )
        .unwrap();
        let mgr = ModelManager::new(ModelPaths::from_root(&root), catalog);
        let payload = plan_asr_job(&mgr, "whisper-large-v3-turbo").unwrap();
        assert_eq!(payload.backend, AsrBackendKind::WhisperCpp);
        assert_eq!(payload.mode, "OfflineMock");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn specialists_error_when_not_installed() {
        let root = std::env::temp_dir().join(format!("asr-sp-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("models").join("weights")).unwrap();
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json"),
            root.join("models").join("catalog.json"),
        )
        .unwrap();
        let catalog = catalog_with_specialists();
        let mgr = ModelManager::new(ModelPaths::from_root(&root), catalog);

        for id in [
            "fireredasr2s",
            "qwen3-asr-1.7b",
            "parakeet-tdt-0.6b-v3",
            "canary-1b-v2",
        ] {
            let err = plan_asr_job(&mgr, id).unwrap_err();
            match err {
                RouterError::ModelNotInstalled(msg) => {
                    assert!(msg.contains(id), "message should name model: {msg}");
                }
                other => panic!("expected ModelNotInstalled for {id}, got {other:?}"),
            }
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn specialist_payload_when_installed() {
        let root = std::env::temp_dir().join(format!("asr-ok-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        let id = "fireredasr2s";
        let dir = root.join("models").join("weights").join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("model.onnx"), b"onnx").unwrap();
        fs::write(dir.join(".installed"), "sha256:fake\n").unwrap();
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json"),
            root.join("models").join("catalog.json"),
        )
        .unwrap();
        let mgr = ModelManager::try_from_root(&root).unwrap();
        let payload = plan_asr_job(&mgr, id).unwrap();
        assert_eq!(payload.backend, AsrBackendKind::Onnx);
        assert_eq!(payload.mode, "Weights");
        assert!(payload.weight_path.is_some());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn default_selects_commercial_whisper_on_lite() {
        let catalog = catalog_with_specialists();
        let root = std::env::temp_dir().join(format!("asr-def-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("models")).unwrap();
        fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/catalog.json"),
            root.join("models").join("catalog.json"),
        )
        .unwrap();
        let mgr = ModelManager::new(ModelPaths::from_root(&root), catalog);
        let id = default_asr_model_id(&mgr, HardwareProfile::Lite, false).unwrap();
        // lite: whisper-small / whisper-base / moonshine preferred over quality-gated models
        assert!(
            id.starts_with("whisper") || id.starts_with("moonshine"),
            "unexpected default {id}"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
