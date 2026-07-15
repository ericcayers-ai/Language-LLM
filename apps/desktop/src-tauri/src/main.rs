//! Language-LLM desktop companion entry.
//!
//! Modes:
//! - Default (with `gui` feature): Tauri desktop manager window + tray.
//! - `--serve`: bind loopback WebSocket, print bootstrap JSON, keep running (headless).
//! - `--native-messaging`: Chrome native messaging (stdio) after WS is up.
//! - `LANGUAGE_LLM_NATIVE=1`: same as `--native-messaging` (for host manifests).
//!
//! Without the `gui` feature, default mode behaves like `--serve`.

use language_llm_desktop::{
    bind_loopback_server, companion_protocol_version, default_data_dir, run_native_messaging,
    CompanionState,
};
use std::env;
use std::sync::Arc;

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();
}

async fn run_headless(native: bool) {
    init_tracing();

    let data_dir = env::var("LANGUAGE_LLM_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| default_data_dir());
    let _ = std::fs::create_dir_all(&data_dir);

    let state = CompanionState::new(data_dir);
    let version = companion_protocol_version();
    tracing::info!("language-llm-desktop protocol {version} (headless)");

    let (port, _server) = match bind_loopback_server(Arc::clone(&state)).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("failed to bind loopback WebSocket: {e}");
            std::process::exit(1);
        }
    };
    tracing::info!("loopback WebSocket listening on 127.0.0.1:{port}");

    if native {
        if let Err(e) = run_native_messaging(state) {
            eprintln!("native messaging ended: {e}");
            std::process::exit(1);
        }
        return;
    }

    let boot = state.bootstrap();
    println!("{}", serde_json::to_string(&boot).unwrap_or_default());
    tracing::info!(
        "bootstrap token ready (connect ws://127.0.0.1:{}/v1?t=…)",
        boot.port
    );

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let native = args.iter().any(|a| a == "--native-messaging")
        || env::var("LANGUAGE_LLM_NATIVE").ok().as_deref() == Some("1");
    let serve = args.iter().any(|a| a == "--serve");
    let headless_flag = args.iter().any(|a| a == "--headless");

    #[cfg(feature = "gui")]
    {
        let force_headless = native || serve || headless_flag;
        if !force_headless {
            init_tracing();
            language_llm_desktop::run_desktop_manager();
            return;
        }
    }
    #[cfg(not(feature = "gui"))]
    {
        let _ = (serve, headless_flag);
    }

    // Headless companion (CI, native messaging host, --serve).
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    rt.block_on(run_headless(native));
}
