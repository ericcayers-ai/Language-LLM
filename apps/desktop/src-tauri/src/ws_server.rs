//! Loopback-only WebSocket server with auth token handshake.

use crate::CompanionState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use inference_router::{default_asr_model_id, plan_asr_job, InferenceMode};
use language_llm_protocol::{
    make_handshake_response, versions_compatible, HardwareProfile, JobKind, PROTOCOL_VERSION,
};
use media_pipeline::{AudioChunkIngest, CaptureJobState};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    /// Bootstrap capability token issued via native messaging.
    pub t: String,
}

/// Bind `127.0.0.1:0`, update state.port, return bound port.
pub async fn bind_loopback_server(
    state: Arc<CompanionState>,
) -> Result<(u16, tokio::task::JoinHandle<()>), std::io::Error> {
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let port = listener.local_addr()?.port();
    state.set_port(port);

    let app = Router::new()
        .route("/v1", get(ws_upgrade))
        .route("/health", get(|| async { "ok" }))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("websocket server error: {e}");
        }
    });
    Ok((port, handle))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    Query(q): Query<WsQuery>,
    State(state): State<Arc<CompanionState>>,
) -> impl IntoResponse {
    let bootstrap_ok = q.t == state.bootstrap_token;
    ws.on_upgrade(move |socket| handle_socket(socket, state, bootstrap_ok))
}

async fn handle_socket(socket: WebSocket, state: Arc<CompanionState>, bootstrap_ok: bool) {
    let (mut sink, mut stream) = socket.split();
    if !bootstrap_ok {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "auth.handshake.failure",
                    "protocolVersion": PROTOCOL_VERSION,
                    "code": "origin-rejected",
                    "message": "invalid bootstrap token",
                    "ok": false
                })
                .to_string()
                .into(),
            ))
            .await;
        return;
    }

    let mut session_token: Option<String> = None;

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).to_string(),
            Message::Close(_) => break,
            Message::Ping(p) => {
                let _ = sink.send(Message::Pong(p)).await;
                continue;
            }
            Message::Pong(_) => continue,
        };

        let value: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => {
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "error",
                            "code": "invalid-json",
                            "message": "could not parse message",
                            "fatal": false
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
                continue;
            }
        };

        let msg_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match msg_type {
            "auth.handshake.request" => {
                let protocol_version = value
                    .get("protocolVersion")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let extension_id = value
                    .get("extensionId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let nonce = value.get("nonce").and_then(|v| v.as_str()).unwrap_or("");
                if !versions_compatible(protocol_version, PROTOCOL_VERSION) {
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "auth.handshake.failure",
                                "protocolVersion": PROTOCOL_VERSION,
                                "code": "version-mismatch",
                                "message": "protocol major mismatch",
                                "ok": false
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                    break;
                }
                if nonce.len() < 16 || extension_id.is_empty() {
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "auth.handshake.failure",
                                "protocolVersion": PROTOCOL_VERSION,
                                "code": "internal",
                                "message": "incomplete handshake",
                                "ok": false
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                    break;
                }
                let session = state.issue_session(extension_id, now_ms());
                session_token = Some(session.token.clone());
                let resp = make_handshake_response(
                    session.token,
                    session.expires_at_ms,
                    Some(env!("CARGO_PKG_VERSION").into()),
                );
                let _ = sink
                    .send(Message::Text(
                        serde_json::to_string(&resp).unwrap_or_default().into(),
                    ))
                    .await;
            }
            "session.ping" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let token = session_token.clone().unwrap_or_default();
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "session.pong",
                            "sessionToken": token,
                            "atMs": now_ms()
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
            "job.submit" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_job_submit(&state, &value, &mut sink).await;
            }
            "job.cancel" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let job_id = value.get("jobId").and_then(|v| v.as_str()).unwrap_or("");
                let ok = state.jobs.lock().unwrap().cancel(job_id);
                let _ = state.capture.lock().unwrap().cancel(job_id);
                let token = session_token.clone().unwrap_or_default();
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "job.progress",
                            "sessionToken": token,
                            "progress": {
                                "jobId": job_id,
                                "kind": "asr",
                                "status": if ok { "cancelled" } else { "failed" },
                                "fraction": 1.0,
                                "updatedAtMs": now_ms()
                            }
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
            "job.pause" | "job.resume" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let job_id = value.get("jobId").and_then(|v| v.as_str()).unwrap_or("");
                let pause = msg_type == "job.pause";
                let ok = if pause {
                    let _ = state.capture.lock().unwrap().pause(job_id);
                    state.jobs.lock().unwrap().pause(job_id)
                } else {
                    let _ = state.capture.lock().unwrap().resume(job_id);
                    state.jobs.lock().unwrap().resume(job_id)
                };
                let token = session_token.clone().unwrap_or_default();
                let status = if !ok {
                    "failed"
                } else if pause {
                    "paused"
                } else {
                    "running"
                };
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "job.progress",
                            "sessionToken": token,
                            "progress": {
                                "jobId": job_id,
                                "kind": "asr",
                                "status": status,
                                "fraction": 0.0,
                                "updatedAtMs": now_ms()
                            }
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
            "audio.chunk" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_audio_chunk(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "lyrics.resolve" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_lyrics_resolve(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "lyrics.clear-cache" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let video_id = value.get("videoId").and_then(|v| v.as_str());
                let n = state.clear_lyrics_cache(video_id);
                let token = session_token.clone().unwrap_or_default();
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "lyrics.cache.cleared",
                            "sessionToken": token,
                            "cleared": n
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
            "settings.lyrics.network" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let allowed = value
                    .get("allowed")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                state.set_lyrics_network_allowed(allowed);
                let token = session_token.clone().unwrap_or_default();
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "settings.lyrics.network",
                            "sessionToken": token,
                            "allowed": allowed
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
            "timeline.source" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                if let Some(timeline) = value.get("timeline") {
                    if let (Some(vid), Some(hash)) = (
                        timeline.get("videoId").and_then(|v| v.as_str()),
                        timeline.get("sourceHash").and_then(|v| v.as_str()),
                    ) {
                        if let Ok(guard) = state.sqlite.lock() {
                            if let Some(db) = guard.as_ref() {
                                let body = timeline.to_string();
                                let _ = db.put_transcript(vid, hash, &body);
                            }
                        }
                    }
                }
            }
            _ => {
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "error",
                            "code": "unknown-type",
                            "message": format!("unsupported message type: {msg_type}"),
                            "fatal": false
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
        }
    }
}

fn authed(state: &CompanionState, session_token: &Option<String>, value: &Value) -> bool {
    let Some(expected) = session_token else {
        return false;
    };
    let provided = value
        .get("sessionToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    provided == expected && state.session_valid(expected, now_ms())
}

async fn send_auth_error(sink: &mut (impl SinkExt<Message> + Unpin)) {
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "error",
                "code": "unauthorized",
                "message": "missing or invalid session",
                "fatal": false
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_job_submit(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
) {
    let job_id = value
        .get("jobId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let video_id = value
        .get("videoId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let kind_str = value
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("translate");
    let kind = match kind_str {
        "asr" => JobKind::Asr,
        "page-translate" => JobKind::PageTranslate,
        "lyrics-resolve" => JobKind::LyricsResolve,
        "align" => JobKind::Align,
        _ => JobKind::Translate,
    };
    let payload = value.get("payload").cloned().unwrap_or(json!({}));
    let token = value
        .get("sessionToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    {
        let mut jobs = state.jobs.lock().unwrap();
        jobs.submit(job_id.clone(), kind, video_id.clone(), payload.clone());
    }

    let _ = sink
        .send(Message::Text(
            json!({
                "type": "job.progress",
                "sessionToken": token,
                "progress": {
                    "jobId": job_id,
                    "kind": kind_str,
                    "status": "running",
                    "fraction": 0.1,
                    "updatedAtMs": now_ms()
                }
            })
            .to_string()
            .into(),
        ))
        .await;

    match kind {
        JobKind::Translate => {
            let mode = {
                let mgr = state.model_manager.lock().unwrap();
                mgr.as_ref()
                    .and_then(|m| m.require_or_mock("hy-mt2-1.8b").ok())
                    .unwrap_or(InferenceMode::OfflineMock)
            };
            let progress = {
                let mut jobs = state.jobs.lock().unwrap();
                jobs.run_mock_translate(&job_id, mode)
            };
            if let Some(p) = progress {
                let result = state
                    .jobs
                    .lock()
                    .unwrap()
                    .get(&job_id)
                    .and_then(|j| j.result.clone())
                    .unwrap_or(json!({}));
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "job.progress",
                            "sessionToken": token,
                            "progress": {
                                "jobId": p.job_id,
                                "kind": "translate",
                                "status": "succeeded",
                                "fraction": 1.0,
                                "message": p.message,
                                "updatedAtMs": now_ms()
                            }
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "timeline.translation",
                            "sessionToken": token,
                            "videoId": video_id,
                            "cues": result.get("cues").cloned().unwrap_or(json!([])),
                            "revisionId": result.get("revisionId").cloned().unwrap_or(json!("rev-mock"))
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "job.result",
                            "sessionToken": token,
                            "jobId": job_id,
                            "kind": "translate",
                            "result": result
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
        }
        JobKind::PageTranslate => {
            let result = {
                let mut jobs = state.jobs.lock().unwrap();
                jobs.run_mock_page_translate(&job_id)
            };
            if let Some(result) = result {
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "page.translate.result",
                            "sessionToken": token,
                            "jobId": job_id,
                            "results": result.get("results").cloned().unwrap_or(json!([])),
                            "cacheHit": false
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
            }
        }
        JobKind::Asr => {
            let requested = payload
                .get("modelId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let plan_result = {
                let mgr = state.model_manager.lock().unwrap();
                match mgr.as_ref() {
                    Some(m) => {
                        let id = requested.unwrap_or_else(|| {
                            default_asr_model_id(m, HardwareProfile::Lite, false)
                                .unwrap_or_else(|_| "whisper-large-v3-turbo".into())
                        });
                        Some(plan_asr_job(m, &id).map_err(|e| (id, e)))
                    }
                    None => None,
                }
            };

            match plan_result {
                Some(Err((id, err))) => {
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "error",
                                "sessionToken": token,
                                "code": "model-not-installed",
                                "message": err.to_string(),
                                "modelId": id,
                                "jobId": job_id,
                                "fatal": false
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "job.progress",
                                "sessionToken": token,
                                "progress": {
                                    "jobId": job_id,
                                    "kind": "asr",
                                    "status": "failed",
                                    "fraction": 1.0,
                                    "message": err.to_string(),
                                    "updatedAtMs": now_ms()
                                }
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                }
                other => {
                    let asr_meta = other.and_then(|r| r.ok());
                    {
                        let mut cap = state.capture.lock().unwrap();
                        cap.start_with_id(job_id.clone(), video_id.clone());
                    }
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "job.progress",
                                "sessionToken": token,
                                "progress": {
                                    "jobId": job_id,
                                    "kind": "asr",
                                    "status": "running",
                                    "fraction": 0.05,
                                    "message": "awaiting audio.chunk from tabCapture",
                                    "updatedAtMs": now_ms()
                                },
                                "asr": asr_meta
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                }
            }
        }
        _ => {
            let _ = sink
                .send(Message::Text(
                    json!({
                        "type": "job.result",
                        "sessionToken": token,
                        "jobId": job_id,
                        "kind": kind_str,
                        "result": { "ok": true, "mock": true }
                    })
                    .to_string()
                    .into(),
                ))
                .await;
        }
    }
}

async fn handle_audio_chunk(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let job_id = value
        .get("jobId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sample_rate = value
        .get("sampleRateHz")
        .and_then(|v| v.as_u64())
        .unwrap_or(48_000) as u32;
    let seq = value.get("seq").and_then(|v| v.as_u64()).unwrap_or(0);
    let b64 = value
        .get("pcmI16LeBase64")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .unwrap_or_default();

    let ingest_err = {
        let mut cap = state.capture.lock().unwrap();
        if cap.get(&job_id).is_none() {
            cap.start_with_id(job_id.clone(), "live");
        }
        cap.ingest_i16_le(AudioChunkIngest {
            job_id: job_id.clone(),
            sample_rate_hz: sample_rate,
            pcm_i16_le: bytes,
            seq,
        })
        .err()
    };
    if let Some(e) = ingest_err {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "error",
                    "sessionToken": session_token,
                    "code": "audio-ingest",
                    "message": e.to_string(),
                    "fatal": false
                })
                .to_string()
                .into(),
            ))
            .await;
        return;
    }

    let (emit_timeline, capture_running) = {
        let cap = state.capture.lock().unwrap();
        let enough = cap
            .snapshot_pcm(&job_id)
            .map(|pcm| pcm.samples.len() > 16_000)
            .unwrap_or(false);
        let running = cap
            .get(&job_id)
            .map(|j| j.state == CaptureJobState::Running)
            .unwrap_or(false);
        (enough, running)
    };

    if emit_timeline {
        let stub_text = "[whisper-stub] live capture transcript";
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "timeline.source",
                    "sessionToken": session_token,
                    "timeline": {
                        "videoId": "live",
                        "cues": [{
                            "id": "asr-0",
                            "startMs": 0,
                            "endMs": 2000,
                            "text": stub_text,
                            "provenance": "asr"
                        }],
                        "sourceHash": "asr-live",
                        "immutable": true,
                        "captionSource": "asr-live"
                    }
                })
                .to_string()
                .into(),
            ))
            .await;
        if capture_running {
            let _ = sink
                .send(Message::Text(
                    json!({
                        "type": "job.progress",
                        "sessionToken": session_token,
                        "progress": {
                            "jobId": job_id,
                            "kind": "asr",
                            "status": "running",
                            "fraction": 0.5,
                            "message": "stub ASR from ring buffer",
                            "updatedAtMs": now_ms()
                        }
                    })
                    .to_string()
                    .into(),
                ))
                .await;
        }
    }
}

async fn handle_lyrics_resolve(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let job_id = value
        .get("jobId")
        .and_then(|v| v.as_str())
        .unwrap_or("lyrics")
        .to_string();
    let track_name = value
        .get("trackName")
        .or_else(|| value.pointer("/payload/trackName"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let artist_name = value
        .get("artistName")
        .or_else(|| value.pointer("/payload/artistName"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let video_id = value
        .get("videoId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    if !state.lyrics_network_allowed() {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "error",
                    "sessionToken": session_token,
                    "code": "lyrics-network-disabled",
                    "message": "Enable lyrics network (LRCLIB only) in settings, or import LRC.",
                    "fatal": false
                })
                .to_string()
                .into(),
            ))
            .await;
        return;
    }

    let mut url = format!(
        "https://lrclib.net/api/search?track_name={}",
        urlencoding_encode(&track_name)
    );
    if let Some(a) = &artist_name {
        url.push_str(&format!("&artist_name={}", urlencoding_encode(a)));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build();
    let tracks = match client {
        Ok(c) => match c
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => res.json::<Value>().await.ok(),
            _ => None,
        },
        Err(_) => None,
    };

    let synced = tracks
        .as_ref()
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|t| t.get("syncedLyrics").and_then(|x| x.as_str()))
        .map(|s| s.to_string());

    if let Some(body) = synced {
        let attribution = "Lyrics via LRCLIB (https://lrclib.net/). Attribution retained locally; clearable in settings.";
        state.cache_lyrics(&video_id, "lrclib", &body, attribution);
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "lyrics.timeline",
                    "sessionToken": session_token,
                    "jobId": job_id,
                    "lrc": body,
                    "attribution": {
                        "source": "lyrics-open-api",
                        "provider": "LRCLIB",
                        "url": "https://lrclib.net/",
                        "fetchedAtMs": now_ms(),
                        "licenseNote": attribution
                    }
                })
                .to_string()
                .into(),
            ))
            .await;
    } else {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "error",
                    "sessionToken": session_token,
                    "code": "lyrics-not-found",
                    "message": "LRCLIB returned no synced lyrics",
                    "fatal": false
                })
                .to_string()
                .into(),
            ))
            .await;
    }
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
