//! Tauri IPC commands for the desktop manager UI.

#![cfg(feature = "gui")]

use crate::manager::{
    apply_retention, estimate_disk, export_logs_redacted, hardware_snapshot, health_snapshot,
    model_root_for, pin_extension_id, privacy_wipe, repair_native_host, storage_snapshot,
    update_status, with_models, BackendDiscovery, DiskEstimate, HardwareSnapshot, HealthSnapshot,
    ManagerRuntime, NativeHostRepairResult, StorageSnapshot, UpdateStatus,
};
use crate::service::{self, is_running};
use inference_router::{ModelStatusEntry, ModelVerifyReport};
use language_llm_protocol::HardwareProfile;
use local_store::DictionaryMeta;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    pub id: String,
    pub kind: String,
    pub video_id: String,
    pub status: String,
    pub fraction: f64,
    pub cancelled: bool,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseEntry {
    pub id: String,
    pub family: String,
    pub task: String,
    pub license_class: Option<String>,
    pub commercial_default: bool,
    pub notes: Option<String>,
}

fn parse_profile(s: &str) -> Result<HardwareProfile, String> {
    match s {
        "lite" => Ok(HardwareProfile::Lite),
        "balanced" => Ok(HardwareProfile::Balanced),
        "quality" => Ok(HardwareProfile::Quality),
        "workstation" => Ok(HardwareProfile::Workstation),
        _ => Err(format!("unknown hardware profile: {s}")),
    }
}

#[tauri::command]
pub fn get_health(runtime: State<'_, Arc<ManagerRuntime>>) -> HealthSnapshot {
    health_snapshot(&runtime.state, is_running(&runtime))
}

#[tauri::command]
pub async fn start_service(
    runtime: State<'_, Arc<ManagerRuntime>>,
) -> Result<HealthSnapshot, String> {
    service::start_service(Arc::clone(&runtime)).await?;
    Ok(health_snapshot(&runtime.state, true))
}

#[tauri::command]
pub fn stop_service(runtime: State<'_, Arc<ManagerRuntime>>) -> Result<HealthSnapshot, String> {
    service::stop_service(&runtime)?;
    Ok(health_snapshot(&runtime.state, false))
}

#[tauri::command]
pub fn list_models(
    runtime: State<'_, Arc<ManagerRuntime>>,
) -> Result<Vec<ModelStatusEntry>, String> {
    with_models(&runtime.state, |m| m.list_catalog_status())
}

#[tauri::command]
pub fn verify_model(
    runtime: State<'_, Arc<ManagerRuntime>>,
    model_id: String,
) -> Result<ModelVerifyReport, String> {
    Ok(with_models(&runtime.state, |m| {
        m.verify_model(&model_id).map_err(|e| e.to_string())
    })??)
}

#[tauri::command]
pub fn remove_model(
    runtime: State<'_, Arc<ManagerRuntime>>,
    model_id: String,
) -> Result<bool, String> {
    let removed = with_models(&runtime.state, |m| {
        m.remove_model(&model_id).map_err(|e| e.to_string())
    })??;
    runtime
        .logs
        .push(format!("model remove {model_id}: removed={removed}"));
    Ok(removed)
}

#[tauri::command]
pub async fn install_model_bytes(
    runtime: State<'_, Arc<ManagerRuntime>>,
    model_id: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let path = {
        let guard = runtime
            .state
            .model_manager
            .lock()
            .map_err(|e| e.to_string())?;
        let mgr = guard
            .as_ref()
            .ok_or_else(|| "model catalog unavailable".to_string())?;
        mgr.install_bytes(&model_id, &filename, &bytes)
            .map_err(|e| e.to_string())?
    };
    runtime.logs.push(format!(
        "model install {model_id}/{filename} -> {}",
        path.display()
    ));
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn disk_estimate(runtime: State<'_, Arc<ManagerRuntime>>) -> DiskEstimate {
    estimate_disk(&runtime.state)
}

#[tauri::command]
pub fn get_storage(runtime: State<'_, Arc<ManagerRuntime>>) -> StorageSnapshot {
    storage_snapshot(&runtime.state)
}

#[tauri::command]
pub fn set_retention(
    runtime: State<'_, Arc<ManagerRuntime>>,
    preset: String,
) -> Result<String, String> {
    apply_retention(&runtime.state, &preset)
}

#[tauri::command]
pub fn wipe_privacy(
    runtime: State<'_, Arc<ManagerRuntime>>,
    scope: String,
) -> Result<serde_json::Value, String> {
    let out = privacy_wipe(&runtime.state, &scope)?;
    runtime.logs.push(format!("privacy wipe scope={scope}"));
    Ok(out)
}

#[tauri::command]
pub fn list_dictionaries(
    runtime: State<'_, Arc<ManagerRuntime>>,
) -> Result<Vec<DictionaryMeta>, String> {
    let guard = runtime.state.sqlite.lock().map_err(|e| e.to_string())?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "sqlite store unavailable".to_string())?;
    // DictionaryMeta isn't Serialize — map manually.
    let rows = db.list_dictionaries().map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_jobs(runtime: State<'_, Arc<ManagerRuntime>>) -> Result<Vec<JobView>, String> {
    let guard = runtime.state.jobs.lock().map_err(|e| e.to_string())?;
    Ok(guard
        .list()
        .into_iter()
        .map(|j| JobView {
            id: j.id.clone(),
            kind: format!("{:?}", j.kind),
            video_id: j.video_id.clone(),
            status: format!("{:?}", j.status),
            fraction: j.fraction,
            cancelled: j.cancelled,
            paused: j.paused,
        })
        .collect())
}

#[tauri::command]
pub fn cancel_job(runtime: State<'_, Arc<ManagerRuntime>>, job_id: String) -> Result<bool, String> {
    let mut guard = runtime.state.jobs.lock().map_err(|e| e.to_string())?;
    Ok(guard.cancel(&job_id))
}

#[tauri::command]
pub fn get_hardware(runtime: State<'_, Arc<ManagerRuntime>>) -> HardwareSnapshot {
    let selected = runtime
        .selected_profile
        .lock()
        .map(|g| *g)
        .unwrap_or(HardwareProfile::Balanced);
    let root = model_root_for(&runtime.state);
    hardware_snapshot(selected, &root)
}

#[tauri::command]
pub fn set_hardware_profile(
    runtime: State<'_, Arc<ManagerRuntime>>,
    profile: String,
) -> Result<HardwareSnapshot, String> {
    let parsed = parse_profile(&profile)?;
    if let Ok(mut g) = runtime.selected_profile.lock() {
        *g = parsed;
    }
    let root = model_root_for(&runtime.state);
    Ok(hardware_snapshot(parsed, &root))
}

#[tauri::command]
pub fn discover_backends(runtime: State<'_, Arc<ManagerRuntime>>) -> Vec<BackendDiscovery> {
    crate::manager::discover_backends(&model_root_for(&runtime.state))
}

#[tauri::command]
pub fn list_licenses(runtime: State<'_, Arc<ManagerRuntime>>) -> Result<Vec<LicenseEntry>, String> {
    with_models(&runtime.state, |m| {
        m.catalog
            .models
            .iter()
            .map(|model| LicenseEntry {
                id: model.id.clone(),
                family: model.family.clone(),
                task: model.task.clone(),
                license_class: model.license_class.clone(),
                commercial_default: model.commercial_default.unwrap_or(false),
                notes: model.notes.clone(),
            })
            .collect()
    })
}

#[tauri::command]
pub fn get_update_status() -> UpdateStatus {
    update_status(env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn export_logs(
    runtime: State<'_, Arc<ManagerRuntime>>,
    dest: Option<String>,
) -> Result<String, String> {
    let path = match dest {
        Some(p) => PathBuf::from(p),
        None => runtime.state.data_dir.join("exports").join(format!(
            "language-llm-logs-{}.txt",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        )),
    };
    let written = export_logs_redacted(&runtime.logs, &path)?;
    Ok(written.display().to_string())
}

#[tauri::command]
pub fn pin_extension(
    runtime: State<'_, Arc<ManagerRuntime>>,
    extension_id: String,
) -> Result<String, String> {
    let path = pin_extension_id(&runtime.state.data_dir, &extension_id)?;
    runtime
        .state
        .set_allowed_extension_id(Some(extension_id.trim().to_string()));
    runtime
        .logs
        .push(format!("extension id pinned -> {}", path.display()));
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn repair_native_host_registration(
    app: AppHandle,
    runtime: State<'_, Arc<ManagerRuntime>>,
    extension_id: String,
) -> NativeHostRepairResult {
    let binary = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("language-llm-desktop"));
    let result = repair_native_host(&extension_id, &binary, &runtime.state.data_dir);
    if result.ok {
        runtime
            .state
            .set_allowed_extension_id(Some(extension_id.trim().to_string()));
    }
    runtime.logs.push(result.message.clone());
    let _ = app;
    result
}

#[tauri::command]
pub fn get_diagnostics(runtime: State<'_, Arc<ManagerRuntime>>) -> serde_json::Value {
    let health = health_snapshot(&runtime.state, is_running(&runtime));
    let disk = estimate_disk(&runtime.state);
    let logs: Vec<String> = runtime
        .logs
        .snapshot()
        .into_iter()
        .rev()
        .take(100)
        .map(|l| crate::manager::redact_sensitive(&l))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    serde_json::json!({
        "health": health,
        "disk": disk,
        "logTail": logs,
        "protocolVersion": language_llm_protocol::PROTOCOL_VERSION,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "dataDir": runtime.state.data_dir.display().to_string(),
    })
}

#[tauri::command]
pub fn set_lyrics_network(
    runtime: State<'_, Arc<ManagerRuntime>>,
    allowed: bool,
) -> Result<bool, String> {
    runtime.state.set_lyrics_network_allowed(allowed);
    Ok(allowed)
}

pub fn register_commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        get_health,
        start_service,
        stop_service,
        list_models,
        verify_model,
        remove_model,
        install_model_bytes,
        disk_estimate,
        get_storage,
        set_retention,
        wipe_privacy,
        list_dictionaries,
        list_jobs,
        cancel_job,
        get_hardware,
        set_hardware_profile,
        discover_backends,
        list_licenses,
        get_update_status,
        export_logs,
        pin_extension,
        repair_native_host_registration,
        get_diagnostics,
        set_lyrics_network,
    ])
}
