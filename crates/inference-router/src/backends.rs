//! whisper.cpp / llama.cpp spawn + load interfaces.
//!
//! When binaries and GGUF weights exist under configured paths, command builders
//! produce real argv. When absent, callers use [`crate::InferenceMode::OfflineMock`].

use crate::{ModelManager, ModelPaths, RouterError};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::Duration;

/// Known whisper.cpp CLI binary names (first match wins).
pub const WHISPER_CLI_NAMES: &[&str] = &["whisper-cli", "whisper-cpp", "main", "whisper"];

/// Known llama.cpp CLI binary names.
pub const LLAMA_CLI_NAMES: &[&str] = &["llama-cli", "llama-cpp", "main", "llama"];

/// Resolve whisper / llama CLI + weight roots from env and model layout.
#[derive(Debug, Clone)]
pub struct CppRuntimePaths {
    pub whisper_cli: Option<PathBuf>,
    pub llama_cli: Option<PathBuf>,
    pub bin_dir: PathBuf,
    pub weights_dir: PathBuf,
}

impl CppRuntimePaths {
    /// Discover from [`ModelPaths`] plus optional env overrides:
    /// - `LANGUAGE_LLM_WHISPER_CLI`
    /// - `LANGUAGE_LLM_LLAMA_CLI`
    /// - `LANGUAGE_LLM_BIN_DIR` (defaults to `{root}/models/bin`)
    pub fn discover(paths: &ModelPaths) -> Self {
        let root = paths
            .catalog_path
            .parent()
            .and_then(|p| p.parent())
            .unwrap_or_else(|| Path::new("."));
        let bin_dir = std::env::var_os("LANGUAGE_LLM_BIN_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| root.join("models").join("bin"));

        let whisper_cli = std::env::var_os("LANGUAGE_LLM_WHISPER_CLI")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(|| find_binary(&bin_dir, WHISPER_CLI_NAMES));

        let llama_cli = std::env::var_os("LANGUAGE_LLM_LLAMA_CLI")
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(|| find_binary(&bin_dir, LLAMA_CLI_NAMES));

        Self {
            whisper_cli,
            llama_cli,
            bin_dir,
            weights_dir: paths.weights_dir.clone(),
        }
    }
}

/// Find first executable-looking file matching known names (with OS extensions).
pub fn find_binary(dir: &Path, names: &[&str]) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    for name in names {
        for ext in exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Prefer a `.gguf` under the model weight directory; else any non-marker file.
pub fn discover_weight_file(model_dir: &Path) -> Option<PathBuf> {
    if !model_dir.is_dir() {
        return None;
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(model_dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n != ".installed" && !n.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by(|a, b| {
        let ag = a
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false);
        let bg = b
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false);
        bg.cmp(&ag).then_with(|| a.cmp(b))
    });
    entries.into_iter().next()
}

impl ModelManager {
    /// Absolute path to a discovered weight file for `model_id`, if present.
    pub fn discover_weights(&self, model_id: &str) -> Option<PathBuf> {
        discover_weight_file(&self.paths.model_dir(model_id))
    }
}

#[derive(Debug, Clone)]
pub struct WhisperCppConfig {
    pub cli_path: PathBuf,
    pub model_path: PathBuf,
    pub language: Option<String>,
    /// Extra args appended after the standard set (for test fakes / GPU flags).
    pub extra_args: Vec<OsString>,
}

#[derive(Debug, Clone)]
pub struct LlamaCppConfig {
    pub cli_path: PathBuf,
    pub model_path: PathBuf,
    pub n_predict: u32,
    pub extra_args: Vec<OsString>,
}

/// Build whisper.cpp argv: `cli -m <model> -f <wav> -nt -np …`
pub fn build_whisper_command(cfg: &WhisperCppConfig, wav_path: &Path) -> Command {
    let mut cmd = Command::new(&cfg.cli_path);
    cmd.arg("-m")
        .arg(&cfg.model_path)
        .arg("-f")
        .arg(wav_path)
        .arg("-nt")
        .arg("-np");
    if let Some(lang) = &cfg.language {
        cmd.arg("-l").arg(lang);
    }
    for a in &cfg.extra_args {
        cmd.arg(a);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

/// Build llama.cpp completion argv: `cli -m <model> -p <prompt> -n <n> …`
pub fn build_llama_command(cfg: &LlamaCppConfig, prompt: &str) -> Command {
    let mut cmd = Command::new(&cfg.cli_path);
    cmd.arg("-m")
        .arg(&cfg.model_path)
        .arg("-p")
        .arg(prompt)
        .arg("-n")
        .arg(cfg.n_predict.to_string())
        .arg("--no-display-prompt");
    for a in &cfg.extra_args {
        cmd.arg(a);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

fn output_to_text(out: Output) -> Result<String, RouterError> {
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(RouterError::Scheduler(format!(
            "cpp binary failed (status={}): {stderr}",
            out.status
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Spawn whisper.cpp and collect stdout transcript text.
pub fn run_whisper(cfg: &WhisperCppConfig, wav_path: &Path) -> Result<String, RouterError> {
    if !cfg.cli_path.is_file() {
        return Err(RouterError::WeightsMissing(format!(
            "whisper cli missing: {}",
            cfg.cli_path.display()
        )));
    }
    if !cfg.model_path.is_file() {
        return Err(RouterError::WeightsMissing(format!(
            "whisper model missing: {}",
            cfg.model_path.display()
        )));
    }
    let mut cmd = build_whisper_command(cfg, wav_path);
    let out = cmd
        .output()
        .map_err(|e| RouterError::Io(format!("spawn whisper: {e}")))?;
    output_to_text(out)
}

/// Spawn llama.cpp and collect stdout generation text.
pub fn run_llama(cfg: &LlamaCppConfig, prompt: &str) -> Result<String, RouterError> {
    if !cfg.cli_path.is_file() {
        return Err(RouterError::WeightsMissing(format!(
            "llama cli missing: {}",
            cfg.cli_path.display()
        )));
    }
    if !cfg.model_path.is_file() {
        return Err(RouterError::WeightsMissing(format!(
            "llama model missing: {}",
            cfg.model_path.display()
        )));
    }
    let mut cmd = build_llama_command(cfg, prompt);
    let out = cmd
        .output()
        .map_err(|e| RouterError::Io(format!("spawn llama: {e}")))?;
    output_to_text(out)
}

/// Trait for loading a backend when weights exist.
pub trait CppLoadable {
    fn try_load(
        manager: &ModelManager,
        model_id: &str,
        runtime: &CppRuntimePaths,
    ) -> Result<Self, RouterError>
    where
        Self: Sized;
}

/// Real whisper.cpp runner (or error if CLI/weights missing).
#[derive(Debug, Clone)]
pub struct WhisperCppBackend {
    pub config: WhisperCppConfig,
}

impl CppLoadable for WhisperCppBackend {
    fn try_load(
        manager: &ModelManager,
        model_id: &str,
        runtime: &CppRuntimePaths,
    ) -> Result<Self, RouterError> {
        let cli = runtime.whisper_cli.clone().ok_or_else(|| {
            RouterError::ModelNotInstalled(format!(
                "whisper.cpp CLI not found under {} (or LANGUAGE_LLM_WHISPER_CLI)",
                runtime.bin_dir.display()
            ))
        })?;
        let model_path = manager.discover_weights(model_id).ok_or_else(|| {
            RouterError::ModelNotInstalled(format!(
                "no GGUF/weights for {model_id} under {}",
                manager.paths.model_dir(model_id).display()
            ))
        })?;
        Ok(Self {
            config: WhisperCppConfig {
                cli_path: cli,
                model_path,
                language: None,
                extra_args: vec![],
            },
        })
    }
}

impl crate::WhisperBackend for WhisperCppBackend {
    fn transcribe(&mut self, pcm_16k_mono: &[f32]) -> Result<String, RouterError> {
        if pcm_16k_mono.is_empty() {
            return Err(RouterError::Scheduler("empty pcm".into()));
        }
        // Real path expects a WAV on disk; callers write PCM → WAV then call `run_whisper`.
        // Keep trait usable: reject until file-based API is used.
        Err(RouterError::Scheduler(
            "WhisperCppBackend::transcribe requires WAV via run_whisper; use file path API"
                .into(),
        ))
    }
}

/// Real llama.cpp MT / VLM runner handle.
#[derive(Debug, Clone)]
pub struct LlamaCppBackend {
    pub config: LlamaCppConfig,
}

impl CppLoadable for LlamaCppBackend {
    fn try_load(
        manager: &ModelManager,
        model_id: &str,
        runtime: &CppRuntimePaths,
    ) -> Result<Self, RouterError> {
        let cli = runtime.llama_cli.clone().ok_or_else(|| {
            RouterError::ModelNotInstalled(format!(
                "llama.cpp CLI not found under {} (or LANGUAGE_LLM_LLAMA_CLI)",
                runtime.bin_dir.display()
            ))
        })?;
        let model_path = manager.discover_weights(model_id).ok_or_else(|| {
            RouterError::ModelNotInstalled(format!(
                "no GGUF/weights for {model_id} under {}",
                manager.paths.model_dir(model_id).display()
            ))
        })?;
        Ok(Self {
            config: LlamaCppConfig {
                cli_path: cli,
                model_path,
                n_predict: 128,
                extra_args: vec![],
            },
        })
    }
}

impl LlamaCppBackend {
    pub fn complete(&self, prompt: &str) -> Result<String, RouterError> {
        run_llama(&self.config, prompt)
    }
}

/// Bound how long integration tests wait for a fake CLI (unused by default blocking `output()`).
#[allow(dead_code)]
pub const DEFAULT_CPP_TIMEOUT: Duration = Duration::from_secs(120);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ModelManager;

    fn write_fake_cli(dir: &Path, stem: &str, echo: &str) -> PathBuf {
        #[cfg(windows)]
        {
            let path = dir.join(format!("{stem}.cmd"));
            // `%*` so -m/-f/-p args are accepted; echo fixed success line to stdout.
            let body = format!("@echo off\r\necho {echo}\r\nexit /b 0\r\n");
            fs::write(&path, body).unwrap();
            path
        }
        #[cfg(not(windows))]
        {
            let path = dir.join(stem);
            let mut f = fs::File::create(&path).unwrap();
            writeln!(f, "#!/bin/sh").unwrap();
            writeln!(f, "echo '{echo}'").unwrap();
            writeln!(f, "exit 0").unwrap();
            drop(f);
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&path).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&path, perms).unwrap();
            path
        }
    }

    #[test]
    fn discover_gguf_prefers_gguf_extension() {
        let dir = std::env::temp_dir().join(format!("llm-gguf-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        fs::write(dir.join("model.gguf"), b"gguf").unwrap();
        let found = discover_weight_file(&dir).unwrap();
        assert!(found.ends_with("model.gguf"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn whisper_fake_binary_integration() {
        let root = std::env::temp_dir().join(format!("llm-whisper-int-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        let bin_dir = root.join("models").join("bin");
        let weights = root
            .join("models")
            .join("weights")
            .join("whisper-large-v3-turbo");
        fs::create_dir_all(&bin_dir).unwrap();
        fs::create_dir_all(&weights).unwrap();
        fs::write(
            root.join("models").join("catalog.json"),
            r#"{"catalogVersion":"1","models":[{"id":"whisper-large-v3-turbo","family":"whisper","task":"asr","backend":"whisper-cpp"}]}"#,
        )
        .unwrap();
        fs::write(weights.join("model.gguf"), b"fake-gguf").unwrap();
        let cli = write_fake_cli(&bin_dir, "whisper-cli", "[whisper-fake] ok");
        let wav = root.join("sample.wav");
        fs::write(&wav, b"RIFF").unwrap();

        let mgr = ModelManager::try_from_root(&root).unwrap();
        let runtime = CppRuntimePaths {
            whisper_cli: Some(cli.clone()),
            llama_cli: None,
            bin_dir: bin_dir.clone(),
            weights_dir: mgr.paths.weights_dir.clone(),
        };
        let backend = WhisperCppBackend::try_load(&mgr, "whisper-large-v3-turbo", &runtime).unwrap();
        let text = run_whisper(&backend.config, &wav).unwrap();
        assert!(
            text.contains("whisper-fake"),
            "unexpected stdout: {text:?}"
        );

        // Command builder must include -m and -f.
        let cmd = build_whisper_command(&backend.config, &wav);
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.iter().any(|a| a == "-m"));
        assert!(args.iter().any(|a| a == "-f"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn llama_fake_binary_integration() {
        let root = std::env::temp_dir().join(format!("llm-llama-int-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        let bin_dir = root.join("models").join("bin");
        let weights = root.join("models").join("weights").join("hy-mt2-1.8b");
        fs::create_dir_all(&bin_dir).unwrap();
        fs::create_dir_all(&weights).unwrap();
        fs::write(
            root.join("models").join("catalog.json"),
            r#"{"catalogVersion":"1","models":[{"id":"hy-mt2-1.8b","family":"hy-mt2","task":"mt","backend":"llama-cpp"}]}"#,
        )
        .unwrap();
        fs::write(weights.join("model.gguf"), b"fake").unwrap();
        let cli = write_fake_cli(&bin_dir, "llama-cli", "[es] hola");

        let mgr = ModelManager::try_from_root(&root).unwrap();
        let runtime = CppRuntimePaths {
            whisper_cli: None,
            llama_cli: Some(cli),
            bin_dir,
            weights_dir: mgr.paths.weights_dir.clone(),
        };
        let backend = LlamaCppBackend::try_load(&mgr, "hy-mt2-1.8b", &runtime).unwrap();
        let text = backend.complete("hello").unwrap();
        assert!(text.contains("hola"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn try_load_errors_when_missing() {
        let root = std::env::temp_dir().join(format!("llm-missing-{}", crate::tests_uuid()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("models")).unwrap();
        fs::write(
            root.join("models").join("catalog.json"),
            r#"{"models":[{"id":"whisper-small","family":"whisper","task":"asr","backend":"whisper-cpp"}]}"#,
        )
        .unwrap();
        let mgr = ModelManager::try_from_root(&root).unwrap();
        let runtime = CppRuntimePaths::discover(&mgr.paths);
        let err = WhisperCppBackend::try_load(&mgr, "whisper-small", &runtime).unwrap_err();
        assert!(matches!(err, RouterError::ModelNotInstalled(_)));
        let _ = fs::remove_dir_all(&root);
    }
}
