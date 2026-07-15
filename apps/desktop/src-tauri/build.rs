fn main() {
    // Always emit Tauri build glue when present; headless CI builds still compile
    // without the `gui` feature (commands/tray stay cfg-gated).
    if std::env::var_os("CARGO_FEATURE_GUI").is_some() {
        tauri_build::build();
    }
}
