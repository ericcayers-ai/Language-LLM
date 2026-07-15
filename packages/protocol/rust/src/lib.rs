//! Shared protocol types mirroring `@language-llm/protocol`.

#![deny(unsafe_code)]

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const PROTOCOL_VERSION: &str = "1.0.0";

pub type VideoId = String;
pub type CueId = String;
pub type JobId = String;
pub type SessionToken = String;
pub type RevisionId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provenance {
    HumanCaption,
    AutoCaption,
    Asr,
    UserEdit,
    Mt,
    VlmCorrected,
    LyricsOpenApi,
    LyricsImport,
    PageTranslate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HardwareProfile {
    Lite,
    Balanced,
    Quality,
    Workstation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PowerPolicy {
    Battery,
    Balanced,
    MaximumQuality,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LanguageTier {
    Verified,
    Supported,
    Experimental,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelLicenseClass {
    CommercialDefault,
    Optional,
    ResearchOptIn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobKind {
    Asr,
    Translate,
    Align,
    VlmReview,
    Lookup,
    Export,
    PageTranslate,
    LyricsResolve,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CaptionSourceKind {
    Human,
    Auto,
    AsrLive,
    AsrImport,
    UserEdit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub id: CueId,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTimeline {
    pub video_id: VideoId,
    pub cues: Vec<Cue>,
    pub source_hash: String,
    pub immutable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption_source: Option<CaptionSourceKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// True when cues came from OfflineMock / stub ASR — not a real transcript.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub development_fallback: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationCue {
    pub id: CueId,
    pub source_cue_ids: Vec<CueId>,
    pub text: String,
    pub confidence: f64,
    pub provisional: bool,
    pub revision_id: RevisionId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedEntity {
    pub text: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub cue_ids: Vec<CueId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntry {
    pub source: String,
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub case_sensitive: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextPackage {
    pub video_id: VideoId,
    pub source_cues: Vec<Cue>,
    pub preceding_dialogue: Vec<Cue>,
    pub following_dialogue: Vec<Cue>,
    pub speakers: Vec<String>,
    pub named_entities: Vec<NamedEntity>,
    pub terminology: Vec<GlossaryEntry>,
    pub recurring_phrases: Vec<String>,
    pub user_glossary: Vec<GlossaryEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub unresolved_pronouns: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub job_id: JobId,
    pub kind: JobKind,
    pub status: JobStatus,
    pub fraction: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cue_count: Option<u32>,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthHandshakeRequest {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub protocol_version: String,
    pub extension_id: String,
    pub nonce: String,
    pub requested_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthHandshakeResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub protocol_version: String,
    pub session_token: SessionToken,
    pub expires_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub companion_build: Option<String>,
    pub ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthHandshakeFailure {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub protocol_version: String,
    pub code: String,
    pub message: String,
    pub ok: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    #[serde(rename = "auth.handshake.request")]
    AuthHandshakeRequest {
        #[serde(rename = "protocolVersion")]
        protocol_version: String,
        #[serde(rename = "extensionId")]
        extension_id: String,
        nonce: String,
        #[serde(rename = "requestedAtMs")]
        requested_at_ms: u64,
    },
    #[serde(rename = "auth.handshake.response")]
    AuthHandshakeResponse {
        #[serde(rename = "protocolVersion")]
        protocol_version: String,
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "expiresAtMs")]
        expires_at_ms: u64,
        #[serde(
            rename = "companionBuild",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        companion_build: Option<String>,
        ok: bool,
    },
    #[serde(rename = "auth.handshake.failure")]
    AuthHandshakeFailure {
        #[serde(rename = "protocolVersion")]
        protocol_version: String,
        code: String,
        message: String,
        ok: bool,
    },
    #[serde(rename = "session.ping")]
    SessionPing {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "atMs")]
        at_ms: u64,
    },
    #[serde(rename = "session.pong")]
    SessionPong {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "atMs")]
        at_ms: u64,
    },
    #[serde(rename = "job.submit")]
    JobSubmit {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "jobId")]
        job_id: JobId,
        kind: JobKind,
        #[serde(rename = "videoId")]
        video_id: VideoId,
        payload: serde_json::Value,
    },
    #[serde(rename = "job.cancel")]
    JobCancel {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "jobId")]
        job_id: JobId,
    },
    #[serde(rename = "job.progress")]
    JobProgressMsg {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        progress: JobProgress,
    },
    #[serde(rename = "job.result")]
    JobResult {
        #[serde(rename = "sessionToken")]
        session_token: SessionToken,
        #[serde(rename = "jobId")]
        job_id: JobId,
        kind: JobKind,
        result: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error {
        #[serde(
            rename = "sessionToken",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        session_token: Option<SessionToken>,
        code: String,
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fatal: Option<bool>,
    },
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("invalid protocol version: {0}")]
    InvalidVersion(String),
    #[error("major version mismatch: client={client} companion={companion}")]
    MajorMismatch { client: String, companion: String },
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
}

pub fn parse_major(version: &str) -> Result<u32, ProtocolError> {
    let major = version
        .split('.')
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| ProtocolError::InvalidVersion(version.to_string()))?;
    Ok(major)
}

pub fn versions_compatible(client: &str, companion: &str) -> bool {
    match (parse_major(client), parse_major(companion)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

pub fn make_handshake_request(
    extension_id: impl Into<String>,
    nonce: impl Into<String>,
    requested_at_ms: u64,
) -> WsMessage {
    WsMessage::AuthHandshakeRequest {
        protocol_version: PROTOCOL_VERSION.to_string(),
        extension_id: extension_id.into(),
        nonce: nonce.into(),
        requested_at_ms,
    }
}

pub fn make_handshake_response(
    session_token: impl Into<String>,
    expires_at_ms: u64,
    companion_build: Option<String>,
) -> WsMessage {
    WsMessage::AuthHandshakeResponse {
        protocol_version: PROTOCOL_VERSION.to_string(),
        session_token: session_token.into(),
        expires_at_ms,
        companion_build,
        ok: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_roundtrip() {
        let msg = make_handshake_request(
            "ext-id-abcdefghijklmnop",
            "nonce-0123456789ab",
            1_700_000_000_000,
        );
        let json = serde_json::to_string(&msg).expect("serialize");
        assert!(json.contains("auth.handshake.request"));
        assert!(json.contains("protocolVersion"));
        let back: WsMessage = serde_json::from_str(&json).expect("deserialize");
        match back {
            WsMessage::AuthHandshakeRequest {
                protocol_version,
                extension_id,
                ..
            } => {
                assert_eq!(protocol_version, PROTOCOL_VERSION);
                assert_eq!(extension_id, "ext-id-abcdefghijklmnop");
            }
            other => panic!("unexpected variant: {other:?}"),
        }
    }

    #[test]
    fn response_roundtrip() {
        let msg =
            make_handshake_response("aabbccddeeff00112233445566778899", 99, Some("0.1.0".into()));
        let json = serde_json::to_vec(&msg).unwrap();
        let back: WsMessage = serde_json::from_slice(&json).unwrap();
        match back {
            WsMessage::AuthHandshakeResponse {
                ok, session_token, ..
            } => {
                assert!(ok);
                assert_eq!(session_token.len(), 32);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn major_compat() {
        assert!(versions_compatible("1.0.0", "1.9.9"));
        assert!(!versions_compatible("2.0.0", "1.0.0"));
    }
}
