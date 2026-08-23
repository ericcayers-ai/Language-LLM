//! Loopback-only WebSocket server with auth token handshake.

use crate::CompanionState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use inference_router::{
    default_asr_model_id, plan_asr_job, run_whisper, CppLoadable, CppRuntimePaths, InferenceMode,
    LlamaCppBackend, WhisperBackend, WhisperCppBackend, WhisperStub,
};
use language_llm_protocol::{
    make_handshake_response, versions_compatible, HardwareProfile, JobKind, JobStatus,
    PROTOCOL_VERSION,
};
use local_store::{DictionaryMeta, PrivacyWipeScope, RetentionPreset};
use media_pipeline::{
    write_wav_mono, AudioChunkIngest, CaptureJobState, PcmMono, TARGET_SAMPLE_RATE_HZ,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;

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
    headers: HeaderMap,
) -> Response {
    if let Some(origin) = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        if !state.origin_allowed(origin) {
            return (StatusCode::FORBIDDEN, "origin rejected").into_response();
        }
    }
    let bootstrap_ok = state.validate_bootstrap_token(&q.t);
    ws.on_upgrade(move |socket| handle_socket(socket, state, bootstrap_ok))
        .into_response()
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
                let requested_at_ms = value
                    .get("requestedAtMs")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let now = now_ms();
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
                if !state.validate_handshake_timestamp(requested_at_ms, now) {
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "auth.handshake.failure",
                                "protocolVersion": PROTOCOL_VERSION,
                                "code": "rate-limited",
                                "message": "handshake timestamp skew too large",
                                "ok": false
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                    break;
                }
                if let Err(msg) = state.extension_id_allowed(extension_id) {
                    let _ = sink
                        .send(Message::Text(
                            json!({
                                "type": "auth.handshake.failure",
                                "protocolVersion": PROTOCOL_VERSION,
                                "code": "origin-rejected",
                                "message": msg,
                                "ok": false
                            })
                            .to_string()
                            .into(),
                        ))
                        .await;
                    break;
                }
                let session = state.issue_session(extension_id, now);
                session_token = Some(session.token.clone());
                state.rotate_bootstrap_token();
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
            "timeline.hydrate" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_timeline_hydrate(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "privacy.wipe" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_privacy_wipe(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "retention.set" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_retention_set(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "retention.get" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_retention_get(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "study.sync" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_study_sync(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "dictionary.import" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_dictionary_import(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "dictionary.lookup" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_dictionary_lookup(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "dictionary.stats" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                handle_dictionary_stats(&state, &value, &mut sink, session_token.as_deref()).await;
            }
            "page.translate.cache.clear" => {
                if !authed(&state, &session_token, &value) {
                    send_auth_error(&mut sink).await;
                    continue;
                }
                let canonical_url = value.get("canonicalUrl").and_then(|v| v.as_str());
                let cleared = with_sqlite(&state, |db| db.clear_page_cache(canonical_url));
                let token = session_token.clone().unwrap_or_default();
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "page.translate.cache.clear",
                            "sessionToken": token,
                            "cleared": cleared.unwrap_or(0)
                        })
                        .to_string()
                        .into(),
                    ))
                    .await;
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
        "asr" => Some(JobKind::Asr),
        "translate" => Some(JobKind::Translate),
        "page-translate" => Some(JobKind::PageTranslate),
        "align" => Some(JobKind::Align),
        "vlm-review" => Some(JobKind::VlmReview),
        "lookup" => Some(JobKind::Lookup),
        "export" => Some(JobKind::Export),
        "lyrics-resolve" => Some(JobKind::LyricsResolve),
        _ => None,
    };
    let payload = value.get("payload").cloned().unwrap_or(json!({}));
    let token = value
        .get("sessionToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let Some(kind) = kind else {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "error",
                    "sessionToken": token,
                    "code": "unsupported-job-kind",
                    "message": format!("unknown job kind: {kind_str}"),
                    "jobId": job_id,
                    "fatal": false
                })
                .to_string()
                .into(),
            ))
            .await;
        return;
    };

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
            let (mode, llama_backend) = {
                let mgr_guard = state.model_manager.lock().unwrap();
                match mgr_guard.as_ref() {
                    Some(m) => {
                        let mode = m
                            .require_or_mock("hy-mt2-1.8b")
                            .unwrap_or(InferenceMode::OfflineMock);
                        let backend = if matches!(mode, InferenceMode::Weights) {
                            let runtime = CppRuntimePaths::discover(&m.paths);
                            LlamaCppBackend::try_load(m, "hy-mt2-1.8b", &runtime).ok()
                        } else {
                            None
                        };
                        (mode, backend)
                    }
                    None => (InferenceMode::OfflineMock, None),
                }
            };
            let progress = {
                let mut jobs = state.jobs.lock().unwrap();
                jobs.run_translate(&job_id, mode, llama_backend.as_ref())
                    .ok()
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
                persist_translation(state, &video_id, &result);
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
            let (mode, llama_backend) = {
                let mgr_guard = state.model_manager.lock().unwrap();
                match mgr_guard.as_ref() {
                    Some(m) => {
                        let mode = m
                            .require_or_mock("hy-mt2-1.8b")
                            .unwrap_or(InferenceMode::OfflineMock);
                        let backend = if matches!(mode, InferenceMode::Weights) {
                            let runtime = CppRuntimePaths::discover(&m.paths);
                            LlamaCppBackend::try_load(m, "hy-mt2-1.8b", &runtime).ok()
                        } else {
                            None
                        };
                        (mode, backend)
                    }
                    None => (InferenceMode::OfflineMock, None),
                }
            };
            let result = {
                let mut jobs = state.jobs.lock().unwrap();
                jobs.run_page_translate(&job_id, mode, llama_backend.as_ref())
            };
            if let Some(result) = result {
                let message = if matches!(mode, InferenceMode::OfflineMock) {
                    "page-translate complete (offline mock)"
                } else {
                    "page-translate complete (llama.cpp)"
                };
                let _ = sink
                    .send(Message::Text(
                        json!({
                            "type": "job.progress",
                            "sessionToken": token,
                            "progress": {
                                "jobId": job_id,
                                "kind": "page-translate",
                                "status": "succeeded",
                                "fraction": 1.0,
                                "message": message,
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
                            "type": "page.translate.result",
                            "sessionToken": token,
                            "jobId": job_id,
                            "results": result.get("results").cloned().unwrap_or(json!([])),
                            "cacheHit": false,
                            "mode": result.get("mode").cloned().unwrap_or(json!("OfflineMock"))
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
            {
                let mut jobs = state.jobs.lock().unwrap();
                if let Some(j) = jobs.get_mut(&job_id) {
                    j.status = JobStatus::Failed;
                    j.fraction = 1.0;
                    j.result = Some(json!({
                        "ok": false,
                        "error": "unsupported-job-kind",
                        "kind": kind_str
                    }));
                }
            }
            let _ = sink
                .send(Message::Text(
                    json!({
                        "type": "job.progress",
                        "sessionToken": token,
                        "progress": {
                            "jobId": job_id,
                            "kind": kind_str,
                            "status": "failed",
                            "fraction": 1.0,
                            "message": format!("unsupported job kind via job.submit: {kind_str}"),
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
                        "type": "job.result",
                        "sessionToken": token,
                        "jobId": job_id,
                        "kind": kind_str,
                        "result": {
                            "ok": false,
                            "error": "unsupported-job-kind",
                            "kind": kind_str
                        }
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
    // Inbound: audio.chunk { jobId, sampleRateHz, seq, pcmI16LeBase64 }
    // Outbound fan-in: timeline.source, job.progress, error
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
            return;
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

    let (should_asr, video_id, capture_running, asr_model_id, asr_mode) = {
        let cap = state.capture.lock().unwrap();
        let Some(job) = cap.get(&job_id) else {
            return;
        };
        let sample_count = job.ring.len_samples();
        let segment = (sample_count / 16_000).max(1) as u64;
        let should = sample_count > 16_000 && segment > job.last_asr_segment;
        let running = job.state == CaptureJobState::Running;
        let (model_id, mode) = {
            let mgr = state.model_manager.lock().unwrap();
            match mgr.as_ref() {
                Some(m) => {
                    let id = default_asr_model_id(m, HardwareProfile::Lite, false)
                        .unwrap_or_else(|_| "whisper-large-v3-turbo".into());
                    let mode = m.require_or_mock(&id).unwrap_or(InferenceMode::OfflineMock);
                    (id, mode)
                }
                None => ("whisper-large-v3-turbo".into(), InferenceMode::OfflineMock),
            }
        };
        (should, job.video_id.clone(), running, model_id, mode)
    };

    if !should_asr {
        return;
    }

    let pcm = {
        let cap = state.capture.lock().unwrap();
        cap.snapshot_pcm(&job_id).ok()
    };
    let Some(pcm) = pcm else {
        return;
    };

    let segment = (pcm.samples.len() / 16_000).max(1) as u64;
    {
        let mut cap = state.capture.lock().unwrap();
        let _ = cap.mark_asr_segment(&job_id, segment);
    }

    let duration_ms = (pcm.samples.len() as u64 * 1000) / TARGET_SAMPLE_RATE_HZ as u64;
    let (transcript, used_stub, asr_failed) =
        run_asr_on_pcm(state, &pcm, &asr_model_id, asr_mode).await;

    if asr_failed {
        let _ = sink
            .send(Message::Text(
                json!({
                    "type": "error",
                    "sessionToken": session_token,
                    "code": "asr-inference",
                    "message": transcript,
                    "jobId": job_id,
                    "fatal": false
                })
                .to_string()
                .into(),
            ))
            .await;
        return;
    }

    // OfflineMock must not claim captionSource "asr-live"; real whisper paths may.
    let mut timeline = json!({
        "videoId": video_id,
        "cues": [{
            "id": format!("asr-{segment}"),
            "startMs": 0,
            "endMs": duration_ms.max(500),
            "text": transcript,
            "provenance": "asr"
        }],
        "sourceHash": if used_stub {
            format!("asr-stub-{segment}")
        } else {
            format!("asr-live-{segment}")
        },
        "immutable": true
    });
    if used_stub {
        timeline["developmentFallback"] = json!(true);
    } else {
        timeline["captionSource"] = json!("asr-live");
    }
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "timeline.source",
                "sessionToken": session_token,
                "timeline": timeline
            })
            .to_string()
            .into(),
        ))
        .await;
    if capture_running {
        let msg = if used_stub {
            "OfflineMock ASR stub from ring buffer (weights not installed)"
        } else {
            "whisper.cpp ASR from ring buffer"
        };
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
                        "message": msg,
                        "updatedAtMs": now_ms()
                    }
                })
                .to_string()
                .into(),
            ))
            .await;
    }
}

/// Returns (text, is_offline_stub, inference_failed).
async fn run_asr_on_pcm(
    state: &Arc<CompanionState>,
    pcm: &PcmMono,
    model_id: &str,
    mode: InferenceMode,
) -> (String, bool, bool) {
    match mode {
        InferenceMode::OfflineMock => {
            let mut stub = WhisperStub;
            let text = stub.transcribe(&pcm.samples).unwrap_or_else(|_| {
                "[whisper-stub] OfflineMock ASR — install verified weights for real transcription"
                    .into()
            });
            (text, true, false)
        }
        InferenceMode::Weights => {
            let wav_path = std::env::temp_dir().join(format!(
                "language-llm-asr-{}-{}.wav",
                model_id.replace('/', "_"),
                now_ms()
            ));
            if write_wav_mono(&wav_path, pcm).is_err() {
                return (
                    "failed to write temp WAV for whisper.cpp".into(),
                    false,
                    true,
                );
            }
            let state = Arc::clone(state);
            let model_id = model_id.to_string();
            let wav = wav_path.clone();
            let result = tokio::task::spawn_blocking(move || {
                let mgr_guard = state.model_manager.lock().unwrap();
                let Some(mgr) = mgr_guard.as_ref() else {
                    return Err("no model manager".to_string());
                };
                let runtime = CppRuntimePaths::discover(&mgr.paths);
                let backend = WhisperCppBackend::try_load(mgr, &model_id, &runtime)
                    .map_err(|e| e.to_string())?;
                run_whisper(&backend.config, &wav).map_err(|e| e.to_string())
            })
            .await;
            let _ = std::fs::remove_file(&wav_path);
            match result {
                Ok(Ok(text)) if !text.trim().is_empty() => (text, false, false),
                Ok(Ok(_)) => ("whisper.cpp returned empty transcript".into(), false, true),
                Ok(Err(e)) => (format!("whisper.cpp failed: {e}"), false, true),
                Err(e) => (format!("whisper task failed: {e}"), false, true),
            }
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

fn with_sqlite<T, F>(state: &Arc<CompanionState>, f: F) -> Option<T>
where
    F: FnOnce(&local_store::SqliteStore) -> Result<T, local_store::StoreError>,
{
    let guard = state.sqlite.lock().ok()?;
    let db = guard.as_ref()?;
    f(db).ok()
}

fn persist_translation(state: &Arc<CompanionState>, video_id: &str, result: &Value) {
    let source_hash = result
        .get("sourceHash")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let model_id = result
        .get("modelId")
        .and_then(|v| v.as_str())
        .unwrap_or("mock");
    let model_revision = result
        .get("modelRevision")
        .and_then(|v| v.as_str())
        .unwrap_or("1");
    let target_lang = result
        .get("targetLang")
        .and_then(|v| v.as_str())
        .unwrap_or("ja");
    let revision_id = result
        .get("revisionId")
        .and_then(|v| v.as_str())
        .unwrap_or("rev-mock");
    let cues = result.get("cues").cloned().unwrap_or(json!([]));
    let cues_json = cues.to_string();
    let _ = with_sqlite(state, |db| {
        db.put_translation(
            video_id,
            source_hash,
            model_id,
            model_revision,
            target_lang,
            &cues_json,
            revision_id,
        )
    });
}

async fn handle_timeline_hydrate(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let video_id = value.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
    let source_hash = value.get("sourceHash").and_then(|v| v.as_str());
    let token = session_token.unwrap_or("");
    let mut timeline: Option<Value> = None;
    let mut translation: Option<Value> = None;

    if let Some(hash) = source_hash {
        if let Some(body) = with_sqlite(state, |db| {
            Ok(db.get_transcript(video_id, hash)?.unwrap_or_default())
        }) {
            if !body.is_empty() {
                timeline = serde_json::from_str(&body).ok();
            }
        }
    } else if let Some(body) = with_sqlite(state, |db| {
        Ok(db.get_latest_transcript(video_id)?.unwrap_or_default())
    }) {
        if !body.is_empty() {
            timeline = serde_json::from_str(&body).ok();
        }
    }

    if let Some(Some(tr)) = with_sqlite(state, |db| db.get_translation(video_id, source_hash)) {
        if let Ok(cues) = serde_json::from_str::<Value>(&tr.cues_json) {
            translation = Some(json!({
                "videoId": video_id,
                "cues": cues,
                "revisionId": tr.revision_id,
                "sourceHash": tr.source_hash,
                "targetLang": tr.target_lang,
            }));
        }
    }

    let _ = sink
        .send(Message::Text(
            json!({
                "type": "timeline.hydrated",
                "sessionToken": token,
                "videoId": video_id,
                "timeline": timeline,
                "translation": translation,
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_privacy_wipe(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let scope_str = value.get("scope").and_then(|v| v.as_str()).unwrap_or("all");
    let scope = PrivacyWipeScope::parse(scope_str).unwrap_or(PrivacyWipeScope::All);
    let cleared = with_sqlite(state, |db| db.privacy_wipe(scope)).unwrap_or_default();
    let cleared_json: HashMap<String, Value> =
        cleared.into_iter().map(|(k, v)| (k, json!(v))).collect();
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "privacy.wipe.result",
                "sessionToken": token,
                "cleared": cleared_json,
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_retention_set(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let preset_str = value
        .get("preset")
        .and_then(|v| v.as_str())
        .unwrap_or("days7");
    let preset = RetentionPreset::parse(preset_str).unwrap_or(RetentionPreset::Days7);
    let _ = with_sqlite(state, |db| db.set_retention_preset(preset));
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "retention.status",
                "sessionToken": token,
                "preset": preset.as_str(),
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_retention_get(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let preset =
        with_sqlite(state, |db| db.get_retention_preset()).unwrap_or(RetentionPreset::Days7);
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "retention.status",
                "sessionToken": token,
                "preset": preset.as_str(),
            })
            .to_string()
            .into(),
        ))
        .await;
    let _ = value;
}

async fn handle_study_sync(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let op = value.get("op").and_then(|v| v.as_str()).unwrap_or("get");
    let token = session_token.unwrap_or("");
    let result = match op {
        "put" => {
            let id = value.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let kind = value.get("kind").and_then(|v| v.as_str()).unwrap_or("card");
            let payload = value.get("payload").cloned().unwrap_or(json!({}));
            let clip_start = value
                .get("videoClipStartMs")
                .and_then(|v| v.as_i64())
                .or_else(|| payload.get("videoClipStartMs").and_then(|v| v.as_i64()));
            let clip_end = value
                .get("videoClipEndMs")
                .and_then(|v| v.as_i64())
                .or_else(|| payload.get("videoClipEndMs").and_then(|v| v.as_i64()));
            let ok = with_sqlite(state, |db| {
                db.put_study(id, kind, &payload.to_string(), clip_start, clip_end)
            })
            .is_some();
            json!({ "ok": ok, "id": id })
        }
        "get" => {
            let id = value.get("id").and_then(|v| v.as_str()).unwrap_or("");
            match with_sqlite(state, |db| db.get_study(id)) {
                Some(Some(r)) => json!({
                    "ok": true,
                    "id": r.id,
                    "kind": r.kind,
                    "payload": serde_json::from_str::<Value>(&r.payload_json).unwrap_or(json!({}))
                }),
                _ => json!({ "ok": false, "id": id }),
            }
        }
        "list" => {
            let kind = value.get("kind").and_then(|v| v.as_str()).unwrap_or("card");
            let records = with_sqlite(state, |db| db.list_study_by_kind(kind)).unwrap_or_default();
            let items: Vec<Value> = records
                .into_iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "kind": r.kind,
                        "payload": serde_json::from_str::<Value>(&r.payload_json).unwrap_or(json!({}))
                    })
                })
                .collect();
            json!({ "ok": true, "items": items })
        }
        "delete" => {
            let id = value.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let ok = with_sqlite(state, |db| db.delete_study(id)).unwrap_or(false);
            json!({ "ok": ok, "id": id })
        }
        _ => json!({ "ok": false, "error": "unknown op" }),
    };
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "study.sync.result",
                "sessionToken": token,
                "result": result,
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_dictionary_import(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let id = value.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = value.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let language = value.get("language").and_then(|v| v.as_str()).unwrap_or("");
    let license = value.get("license").and_then(|v| v.as_str()).unwrap_or("");
    let payload_path = value
        .get("payloadPath")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let entries: Vec<(String, String, Option<String>, Option<String>)> = value
        .get("entries")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| {
                    let entry_id = e.get("id")?.as_str()?.to_string();
                    let surface = e.get("surface")?.as_str()?.to_string();
                    let reading = e
                        .get("reading")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    let glossary = e
                        .get("glossaryJson")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    Some((entry_id, surface, reading, glossary))
                })
                .collect()
        })
        .unwrap_or_default();
    let entry_count = entries.len() as i64;
    let meta = DictionaryMeta {
        id: id.to_string(),
        name: name.to_string(),
        language: language.to_string(),
        license: license.to_string(),
        entry_count,
        payload_path: payload_path.to_string(),
        imported_at_ms: now_ms() as i64,
    };
    let imported = with_sqlite(state, |db| {
        db.put_dictionary_meta(&meta)?;
        db.put_dictionary_entries(id, &entries)
    })
    .unwrap_or(0);
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "dictionary.import",
                "sessionToken": token,
                "id": id,
                "imported": imported,
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_dictionary_lookup(
    state: &Arc<CompanionState>,
    value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let surface = value.get("surface").and_then(|v| v.as_str()).unwrap_or("");
    let hits = with_sqlite(state, |db| db.lookup_dictionary(surface)).unwrap_or_default();
    let entries: Vec<Value> = hits
        .into_iter()
        .map(|h| {
            json!({
                "id": h.entry_id,
                "dictionaryId": h.dictionary_id,
                "surface": h.surface,
                "reading": h.reading,
                "glossaryJson": h.glossary_json,
            })
        })
        .collect();
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "dictionary.lookup",
                "sessionToken": token,
                "surface": surface,
                "entries": entries,
            })
            .to_string()
            .into(),
        ))
        .await;
}

async fn handle_dictionary_stats(
    state: &Arc<CompanionState>,
    _value: &Value,
    sink: &mut (impl SinkExt<Message> + Unpin),
    session_token: Option<&str>,
) {
    let (dicts, entries) = with_sqlite(state, |db| db.dictionary_stats()).unwrap_or((0, 0));
    let token = session_token.unwrap_or("");
    let _ = sink
        .send(Message::Text(
            json!({
                "type": "dictionary.stats",
                "sessionToken": token,
                "dictionaries": dicts,
                "entries": entries,
            })
            .to_string()
            .into(),
        ))
        .await;
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
