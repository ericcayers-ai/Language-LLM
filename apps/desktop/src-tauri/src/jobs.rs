//! Job registry: translate / ASR / page-translate / cancel / resume (mock-capable).

use inference_router::{mock_translate_line, InferenceMode, LlamaCppBackend, RouterError};
use language_llm_protocol::{JobKind, JobProgress, JobStatus};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

fn build_mt_prompt(source: &str, target_lang: &str) -> String {
    format!(
        "Translate the following text to {target_lang}. Output only the translation, no explanation.\n\n{source}"
    )
}

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

    pub fn list(&self) -> Vec<&TrackedJob> {
        let mut jobs: Vec<&TrackedJob> = self.jobs.values().collect();
        jobs.sort_by(|a, b| a.id.cmp(&b.id));
        jobs
    }

    pub fn len(&self) -> usize {
        self.jobs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

    /// Run translate job — real llama.cpp when `backend` is Some and mode is Weights.
    pub fn run_translate(
        &mut self,
        job_id: &str,
        mode: InferenceMode,
        backend: Option<&LlamaCppBackend>,
    ) -> Result<JobProgress, RouterError> {
        let job = self
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| RouterError::Scheduler(format!("unknown job {job_id}")))?;
        if job.cancelled {
            return Ok(progress(job, JobStatus::Cancelled, 1.0, Some("cancelled")));
        }
        if job.paused {
            return Ok(progress(
                job,
                JobStatus::Paused,
                job.fraction,
                Some("paused"),
            ));
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

        let translated: Vec<String> = match mode {
            InferenceMode::OfflineMock => texts
                .iter()
                .map(|t| mock_translate_line(t, target))
                .collect(),
            InferenceMode::Weights => {
                let llama = backend.ok_or_else(|| {
                    RouterError::ModelNotInstalled("llama.cpp backend unavailable".into())
                })?;
                texts
                    .iter()
                    .map(|t| {
                        llama
                            .complete(&build_mt_prompt(t, target))
                            .unwrap_or_else(|_| t.clone())
                    })
                    .collect()
            }
        };

        let revision = format!("rev-{}", now_ms());
        let provisional = matches!(mode, InferenceMode::OfflineMock);
        let confidence = if provisional { 0.55 } else { 0.85 };
        job.fraction = 1.0;
        job.status = JobStatus::Succeeded;
        job.result = Some(json!({
            "cues": translated.iter().enumerate().map(|(i, text)| json!({
                "id": format!("t-{i}"),
                "sourceCueIds": [format!("c-{i}")],
                "text": text,
                "confidence": confidence,
                "provisional": provisional,
                "revisionId": revision,
            })).collect::<Vec<_>>(),
            "revisionId": revision,
            "mode": format!("{mode:?}"),
        }));
        Ok(progress(
            job,
            JobStatus::Succeeded,
            1.0,
            Some(if provisional {
                "translate complete (offline mock)"
            } else {
                "translate complete (llama.cpp)"
            }),
        ))
    }

    /// Run a mock translate job from source cue texts in payload.
    pub fn run_mock_translate(&mut self, job_id: &str, mode: InferenceMode) -> Option<JobProgress> {
        self.run_translate(job_id, mode, None).ok()
    }

    /// Page translate — real llama.cpp when `backend` is Some and mode is Weights.
    pub fn run_page_translate(
        &mut self,
        job_id: &str,
        mode: InferenceMode,
        backend: Option<&LlamaCppBackend>,
    ) -> Option<Value> {
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
        let provisional = matches!(mode, InferenceMode::OfflineMock);
        let confidence = if provisional { 0.7 } else { 0.85 };
        let results: Vec<Value> = segments
            .iter()
            .map(|seg| {
                let id = seg.get("id").and_then(|v| v.as_str()).unwrap_or("seg");
                let original = seg
                    .get("originalText")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let translated = match mode {
                    InferenceMode::OfflineMock => mock_translate_line(original, target),
                    InferenceMode::Weights => backend
                        .and_then(|llama| llama.complete(&build_mt_prompt(original, target)).ok())
                        .unwrap_or_else(|| original.to_string()),
                };
                json!({
                    "id": id,
                    "translatedText": translated,
                    "confidence": confidence,
                    "provisional": provisional,
                })
            })
            .collect();
        job.status = JobStatus::Succeeded;
        job.fraction = 1.0;
        let out = json!({
            "results": results,
            "cacheHit": false,
            "mode": format!("{mode:?}"),
        });
        job.result = Some(out.clone());
        Some(out)
    }

    /// Dev-only OfflineMock page translate (no weights / no backend).
    pub fn run_mock_page_translate(&mut self, job_id: &str) -> Option<Value> {
        self.run_page_translate(job_id, InferenceMode::OfflineMock, None)
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
