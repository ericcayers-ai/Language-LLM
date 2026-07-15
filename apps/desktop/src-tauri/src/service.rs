//! Service lifecycle: start/stop the loopback WebSocket companion from the GUI.

use crate::manager::ManagerRuntime;
use crate::ws_server::bind_loopback_server;
use std::sync::Arc;

pub async fn start_service(runtime: Arc<ManagerRuntime>) -> Result<u16, String> {
    {
        let running = runtime.service_running.lock().map_err(|e| e.to_string())?;
        if *running && runtime.state.port() > 0 {
            return Ok(runtime.state.port());
        }
    }

    let state = Arc::clone(&runtime.state);
    let (port, handle) = bind_loopback_server(state)
        .await
        .map_err(|e| format!("bind failed: {e}"))?;

    {
        let mut slot = runtime.ws_handle.lock().map_err(|e| e.to_string())?;
        *slot = Some(handle);
    }
    {
        let mut running = runtime.service_running.lock().map_err(|e| e.to_string())?;
        *running = true;
    }
    runtime.logs.push(format!(
        "service started on 127.0.0.1:{port} protocol={}",
        language_llm_protocol::PROTOCOL_VERSION
    ));

    Ok(port)
}

pub fn stop_service(runtime: &ManagerRuntime) -> Result<(), String> {
    if let Ok(mut slot) = runtime.ws_handle.lock() {
        if let Some(handle) = slot.take() {
            handle.abort();
        }
    }
    if let Ok(mut running) = runtime.service_running.lock() {
        *running = false;
    }
    runtime.state.set_port(0);
    runtime.logs.push("service stopped");
    Ok(())
}

pub fn is_running(runtime: &ManagerRuntime) -> bool {
    runtime.service_running.lock().map(|g| *g).unwrap_or(false) && runtime.state.port() > 0
}
