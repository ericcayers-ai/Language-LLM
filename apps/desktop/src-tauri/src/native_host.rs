//! Chrome native messaging host (length-prefixed JSON on stdin/stdout).

use crate::{BootstrapResponse, CompanionState};
use serde::Deserialize;
use serde_json::json;
use std::io::{self, Read, Write};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
struct NativeRequest {
    #[serde(rename = "type")]
    msg_type: String,
}

/// Blocking native-messaging loop. Bootstrap returns port + token for WebSocket.
pub fn run_native_messaging(state: Arc<CompanionState>) -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdin = stdin.lock();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    loop {
        let mut len_buf = [0u8; 4];
        match stdin.read_exact(&mut len_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(e),
        }
        let len = u32::from_ne_bytes(len_buf) as usize;
        if len == 0 || len > 1024 * 1024 {
            write_message(
                &mut stdout,
                &json!({
                    "ok": false,
                    "error": "invalid-message-length"
                }),
            )?;
            continue;
        }
        let mut body = vec![0u8; len];
        stdin.read_exact(&mut body)?;
        let req: NativeRequest = match serde_json::from_slice(&body) {
            Ok(r) => r,
            Err(_) => {
                write_message(
                    &mut stdout,
                    &json!({ "ok": false, "error": "invalid-json" }),
                )?;
                continue;
            }
        };
        match req.msg_type.as_str() {
            "bootstrap" | "ping" => {
                let BootstrapResponse {
                    ok,
                    port,
                    bootstrap_token,
                    protocol_version,
                } = state.bootstrap();
                write_message(
                    &mut stdout,
                    &json!({
                        "ok": ok,
                        "port": port,
                        "bootstrapToken": bootstrap_token,
                        "protocolVersion": protocol_version,
                    }),
                )?;
            }
            other => {
                write_message(
                    &mut stdout,
                    &json!({
                        "ok": false,
                        "error": format!("unknown-type:{other}")
                    }),
                )?;
            }
        }
    }
    Ok(())
}

fn write_message(out: &mut impl Write, value: &serde_json::Value) -> io::Result<()> {
    let bytes =
        serde_json::to_vec(value).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let len = (bytes.len() as u32).to_ne_bytes();
    out.write_all(&len)?;
    out.write_all(&bytes)?;
    out.flush()?;
    Ok(())
}
