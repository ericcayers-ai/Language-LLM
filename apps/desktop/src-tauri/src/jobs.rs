//! Job registry: translate / ASR / page-translate / cancel / resume (mock-capable).

use inference_router::{mock_translate_line, InferenceMode};
use language_llm_protocol::{JobKind, JobProgress, JobStatus};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct TrackedJob {
    pub id: String,
    pub kind: JobKind,
    pub video_id: String,
    pub status: JobStatus,
    pub fraction: f64,
    pub cancelled: bool,
    pub paused: bool,
    pub payload: Value,
    pub result: Option<Value>,
}

#[derive(Debug, Default)]
pub struct JobRegistry {
    jobs: HashMap<String, TrackedJob>,
}

impl JobRegistry {
    pub fn submit(
        &mut self,
        job_id: String,
        kind: JobKind,
        video_id: String,
        payload: Value,
    ) -> TrackedJob {
        let job = TrackedJob {
            id: job_id.clone(),
            kind,
            video_id,
            status: JobStatus::Queued,
            fraction: 0.0,
            cancelled: false,
            paused: false,
            payload,
            result: None,
        };
        self.jobs.insert(job_id, job.clone());
        job
    }

    pub fn cancel(&mut self, job_id: &str) -> bool {
        if let Some(j) = self.jobs.get_mut(job_id) {
            j.cancelled = true;
            j.status = JobStatus::Cancelled;
            true
        } else {
            false
        }
    }

    pub fn pause(&mut self, job_id: &str) -> bool {
        if let Some(j) = self.jobs.get_mut(job_id) {
            if j.cancelled {
                return false;
            }
            j.paused = true;
            j.status = JobStatus::Paused;
            true
        } else {
            false
        }
    }

    pub fn resume(&mut self, job_id: &str) -> bool {
        if let Some(j) = self.jobs.get_mut(job_id) {
            if j.cancelled {
                return false;
            }
            j.paused = false;
            j.status = JobStatus::Running;
            true
        } else {
            false
        }
    }

    pub fn get(&self, job_id: &str) -> Option<&TrackedJob> {
        self.jobs.get(job_id)
    }

    pub fn get_mut(&mut self, job_id: &str) -> Option<&mut TrackedJob> {
        self.jobs.get_mut(job_id)
    }

    /// Run a mock translate job from source cue texts in payload.
    pub fn run_mock_translate(&mut self, job_id: &str, mode: InferenceMode) -> Option<JobProgress> {
        let job = self.jobs.get_mut(job_id)?;
        if job.cancelled {
            return Some(progress(job, JobStatus::Cancelled, 1.0, Some("cancelled")));
        }
        if job.paused {
            return Some(progress(job, JobStatus::Paused, job.fraction, Some("paused")));
        }
        job.status = JobStatus::Running;
        let target = job
            .payload
            .get("targetLang")
            .and_then(|v| v.as_str())
            .unwrap_or("en");
        let texts: Vec<String> = job
            .payload
            .get("texts")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let prefix = match mode {
            InferenceMode::Weights => "",
            InferenceMode::OfflineMock => "",
        };
        let _ = prefix;
        let translated: Vec<String> = texts
            .iter()
            .map(|t| mock_translate_line(t, target))
            .collect();
        let revision = format!("rev-{}", now_ms());
        job.fraction = 1.0;
        job.status = JobStatus::Succeeded;
        job.result = Some(json!({
            "cues": translated.iter().enumerate().map(|(i, text)| json!({
                "id": format!("t-{i}"),
                "sourceCueIds": [format!("c-{i}")],
                "text": text,
                "confidence": if matches!(mode, InferenceMode::OfflineMock) { 0.55 } else { 0.85 },
                "provisional": matches!(mode, InferenceMode::OfflineMock),
                "revisionId": revision,
            })).collect::<Vec<_>>(),
            "revisionId": revision,
            "mode": format!("{mode:?}"),
        }));
        Some(progress(
            job,
            JobStatus::Succeeded,
            1.0,
            Some("translate complete (mock if weights absent)"),
        ))
    }

    pub fn run_mock_page_translate(&mut self, job_id: &str) -> Option<Value> {
        let job = self.jobs.get_mut(job_id)?;
        if job.cancelled {
            job.status = JobStatus::Cancelled;
            return None;
        }
        job.status = JobStatus::Running;
        let target = job
            .payload
            .get("targetLang")
            .and_then(|v| v.as_str())
            .unwrap_or("en");
        let segments = job
            .payload
            .get("segments")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let results: Vec<Value> = segments
            .iter()
            .map(|seg| {
                let id = seg.get("id").and_then(|v| v.as_str()).unwrap_or("seg");
                let original = seg
                    .get("originalText")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                json!({
                    "id": id,
                    "translatedText": mock_translate_line(original, target),
                    "confidence": 0.7,
                    "provisional": true,
                })
            })
            .collect();
        job.status = JobStatus::Succeeded;
        job.fraction = 1.0;
        let out = json!({ "results": results, "cacheHit": false });
        job.result = Some(out.clone());
        Some(out)
    }
}

fn progress(
    job: &TrackedJob,
    status: JobStatus,
    fraction: f64,
    message: Option<&str>,
) -> JobProgress {
    JobProgress {
        job_id: job.id.clone(),
        kind: job.kind,
        status,
        fraction,
        message: message.map(|s| s.to_string()),
        cue_count: None,
        updated_at_ms: now_ms(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
