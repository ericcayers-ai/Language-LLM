//! Integration smoke: bind loopback WS, handshake, mock translate job.

use futures_util::{SinkExt, StreamExt};
use language_llm_desktop::{bind_loopback_server, CompanionState};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn websocket_handshake_and_mock_translate() {
    let state = CompanionState::new(std::env::temp_dir().join(format!(
        "llm-ws-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    )));
    let (port, _handle) = bind_loopback_server(Arc::clone(&state))
        .await
        .expect("bind");
    let token = state.bootstrap_token();
    let url = format!("ws://127.0.0.1:{port}/v1?t={token}");

    let (ws, _) = connect_async(&url).await.expect("connect");
    let (mut write, mut read) = ws.split();

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let handshake = json!({
        "type": "auth.handshake.request",
        "protocolVersion": "1.0.0",
        "extensionId": "test-extension-id-abcdefgh",
        "nonce": "0123456789abcdef",
        "requestedAtMs": now_ms
    });
    write
        .send(tokio_tungstenite::tungstenite::Message::Text(
            handshake.to_string().into(),
        ))
        .await
        .unwrap();

    let resp = tokio::time::timeout(Duration::from_secs(3), read.next())
        .await
        .expect("timeout")
        .expect("stream")
        .expect("msg");
    let text = resp.to_text().unwrap();
    let v: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(v["type"], "auth.handshake.response");
    assert_eq!(v["ok"], true);
    let session = v["sessionToken"].as_str().unwrap().to_string();

    let job = json!({
        "type": "job.submit",
        "sessionToken": session,
        "jobId": "job-smoke-1",
        "kind": "translate",
        "videoId": "demo",
        "payload": { "texts": ["Hello from captions"], "targetLang": "ja" }
    });
    write
        .send(tokio_tungstenite::tungstenite::Message::Text(
            job.to_string().into(),
        ))
        .await
        .unwrap();

    let mut saw_translation = false;
    for _ in 0..8 {
        let msg = tokio::time::timeout(Duration::from_secs(2), read.next())
            .await
            .expect("timeout")
            .expect("stream")
            .expect("msg");
        let t = msg.to_text().unwrap();
        let body: serde_json::Value = serde_json::from_str(t).unwrap();
        if body["type"] == "timeline.translation" {
            saw_translation = true;
            let cues = body["cues"].as_array().unwrap();
            assert!(!cues.is_empty());
            assert!(cues[0]["text"].as_str().unwrap().contains("[ja]"));
            break;
        }
    }
    assert!(saw_translation, "expected timeline.translation");
}
