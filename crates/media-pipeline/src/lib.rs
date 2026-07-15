//! Decode, resample, VAD, ephemeral chunking, and capture job control.

#![deny(unsafe_code)]

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use thiserror::Error;
use uuid::Uuid;

pub const TARGET_SAMPLE_RATE_HZ: u32 = 16_000;

#[derive(Debug, Error)]
pub enum MediaError {
    #[error("unsupported sample rate {0}")]
    SampleRate(u32),
    #[error("empty pcm buffer")]
    Empty,
    #[error("job cancelled")]
    Cancelled,
    #[error("job not found: {0}")]
    NotFound(String),
    #[error("job not resumable: {0}")]
    NotResumable(String),
    #[error("io: {0}")]
    Io(String),
}

#[derive(Debug, Clone)]
pub struct PcmMono {
    pub sample_rate_hz: u32,
    pub samples: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct VadChunk {
    pub start_ms: u64,
    pub end_ms: u64,
    pub samples: Vec<f32>,
}

/// Audio chunk received from extension tabCapture (16-bit PCM little-endian preferred).
#[derive(Debug, Clone)]
pub struct AudioChunkIngest {
    pub job_id: String,
    pub sample_rate_hz: u32,
    pub pcm_i16_le: Vec<u8>,
    pub seq: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureJobState {
    Running,
    Paused,
    Cancelled,
    Completed,
}

#[derive(Debug)]
pub struct CaptureJob {
    pub id: String,
    pub video_id: String,
    pub state: CaptureJobState,
    pub ring: RingBuffer,
    pub next_seq: u64,
    pub chunks_accepted: u64,
    /// Last ASR segment index emitted (sample_len / 16_000) to throttle whisper invocations.
    pub last_asr_segment: u64,
}

impl CaptureJob {
    pub fn new(video_id: impl Into<String>, ring_capacity: usize) -> Self {
        Self::with_id(Uuid::new_v4().to_string(), video_id, ring_capacity)
    }

    pub fn with_id(
        id: impl Into<String>,
        video_id: impl Into<String>,
        ring_capacity: usize,
    ) -> Self {
        Self {
            id: id.into(),
            video_id: video_id.into(),
            state: CaptureJobState::Running,
            ring: RingBuffer::new(ring_capacity),
            next_seq: 0,
            chunks_accepted: 0,
            last_asr_segment: 0,
        }
    }
}

/// In-memory capture / ASR job queue with cancel + resume.
#[derive(Debug, Default)]
pub struct CaptureJobQueue {
    jobs: HashMap<String, CaptureJob>,
}

impl CaptureJobQueue {
    pub fn start(&mut self, video_id: impl Into<String>) -> &CaptureJob {
        let job = CaptureJob::new(video_id, TARGET_SAMPLE_RATE_HZ as usize * 30);
        let id = job.id.clone();
        self.jobs.insert(id.clone(), job);
        self.jobs.get(&id).expect("just inserted")
    }

    pub fn start_with_id(
        &mut self,
        job_id: impl Into<String>,
        video_id: impl Into<String>,
    ) -> &CaptureJob {
        let job = CaptureJob::with_id(job_id, video_id, TARGET_SAMPLE_RATE_HZ as usize * 30);
        let id = job.id.clone();
        self.jobs.insert(id.clone(), job);
        self.jobs.get(&id).expect("just inserted")
    }

    pub fn cancel(&mut self, job_id: &str) -> Result<(), MediaError> {
        let job = self
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| MediaError::NotFound(job_id.into()))?;
        job.state = CaptureJobState::Cancelled;
        Ok(())
    }

    pub fn pause(&mut self, job_id: &str) -> Result<(), MediaError> {
        let job = self
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| MediaError::NotFound(job_id.into()))?;
        if job.state == CaptureJobState::Cancelled {
            return Err(MediaError::Cancelled);
        }
        job.state = CaptureJobState::Paused;
        Ok(())
    }

    pub fn resume(&mut self, job_id: &str) -> Result<(), MediaError> {
        let job = self
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| MediaError::NotFound(job_id.into()))?;
        match job.state {
            CaptureJobState::Paused => {
                job.state = CaptureJobState::Running;
                Ok(())
            }
            CaptureJobState::Cancelled => Err(MediaError::Cancelled),
            CaptureJobState::Completed => Err(MediaError::NotResumable(job_id.into())),
            CaptureJobState::Running => Ok(()),
        }
    }

    pub fn ingest_i16_le(&mut self, chunk: AudioChunkIngest) -> Result<u64, MediaError> {
        let job = self
            .jobs
            .get_mut(&chunk.job_id)
            .ok_or_else(|| MediaError::NotFound(chunk.job_id.clone()))?;
        if job.state == CaptureJobState::Cancelled {
            return Err(MediaError::Cancelled);
        }
        if job.state == CaptureJobState::Paused {
            return Ok(job.chunks_accepted);
        }
        let samples = pcm_i16_le_to_f32(&chunk.pcm_i16_le);
        let pcm = PcmMono {
            sample_rate_hz: chunk.sample_rate_hz,
            samples,
        };
        let resampled = if pcm.sample_rate_hz == TARGET_SAMPLE_RATE_HZ {
            pcm
        } else {
            resample_linear(&pcm, TARGET_SAMPLE_RATE_HZ)?
        };
        job.ring.push_slice(&resampled.samples);
        job.next_seq = chunk.seq.saturating_add(1);
        job.chunks_accepted += 1;
        Ok(job.chunks_accepted)
    }

    pub fn get(&self, job_id: &str) -> Option<&CaptureJob> {
        self.jobs.get(job_id)
    }

    pub fn mark_asr_segment(&mut self, job_id: &str, segment: u64) -> Result<(), MediaError> {
        let job = self
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| MediaError::NotFound(job_id.into()))?;
        job.last_asr_segment = segment;
        Ok(())
    }

    pub fn snapshot_pcm(&self, job_id: &str) -> Result<PcmMono, MediaError> {
        let job = self
            .jobs
            .get(job_id)
            .ok_or_else(|| MediaError::NotFound(job_id.into()))?;
        let samples = job.ring.snapshot();
        if samples.is_empty() {
            return Err(MediaError::Empty);
        }
        Ok(PcmMono {
            sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
            samples,
        })
    }
}

pub fn pcm_i16_le_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0)
        .collect()
}

/// Write 16-bit PCM mono WAV (RIFF) for whisper.cpp `-f` input.
pub fn write_wav_mono(path: impl AsRef<Path>, pcm: &PcmMono) -> Result<(), MediaError> {
    if pcm.samples.is_empty() {
        return Err(MediaError::Empty);
    }
    let pcm_bytes = f32_to_pcm_i16_le(&pcm.samples);
    let data_len = pcm_bytes.len() as u32;
    let byte_rate = pcm.sample_rate_hz * 2;
    let mut header = Vec::with_capacity(44);
    header.extend_from_slice(b"RIFF");
    header.extend_from_slice(&(36 + data_len).to_le_bytes());
    header.extend_from_slice(b"WAVE");
    header.extend_from_slice(b"fmt ");
    header.extend_from_slice(&16u32.to_le_bytes());
    header.extend_from_slice(&1u16.to_le_bytes()); // PCM
    header.extend_from_slice(&1u16.to_le_bytes()); // mono
    header.extend_from_slice(&pcm.sample_rate_hz.to_le_bytes());
    header.extend_from_slice(&byte_rate.to_le_bytes());
    header.extend_from_slice(&2u16.to_le_bytes()); // block align
    header.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    header.extend_from_slice(b"data");
    header.extend_from_slice(&data_len.to_le_bytes());

    let mut file = File::create(path.as_ref()).map_err(|e| MediaError::Io(e.to_string()))?;
    file.write_all(&header)
        .and_then(|_| file.write_all(&pcm_bytes))
        .map_err(|e| MediaError::Io(e.to_string()))?;
    Ok(())
}

pub fn f32_to_pcm_i16_le(samples: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// Energy-based VAD placeholder — enough for wiring chunk queues.
/// TODO(weights): replace with Silero/webrtc VAD when bundled ONNX lands.
pub fn energy_vad_chunks(
    pcm: &PcmMono,
    frame_ms: u64,
    energy_threshold: f32,
) -> Result<Vec<VadChunk>, MediaError> {
    if pcm.samples.is_empty() {
        return Err(MediaError::Empty);
    }
    if pcm.sample_rate_hz == 0 {
        return Err(MediaError::SampleRate(0));
    }
    let frame_len = ((pcm.sample_rate_hz as u64 * frame_ms) / 1000).max(1) as usize;
    let mut out = Vec::new();
    let mut i = 0usize;
    let mut chunk_start = 0usize;
    let mut in_speech = false;
    while i < pcm.samples.len() {
        let end = (i + frame_len).min(pcm.samples.len());
        let frame = &pcm.samples[i..end];
        let energy = frame.iter().map(|s| s * s).sum::<f32>() / frame.len().max(1) as f32;
        if energy >= energy_threshold {
            if !in_speech {
                chunk_start = i;
                in_speech = true;
            }
        } else if in_speech {
            out.push(chunk_from(pcm.sample_rate_hz, chunk_start, i, &pcm.samples));
            in_speech = false;
        }
        i = end;
    }
    if in_speech {
        out.push(chunk_from(
            pcm.sample_rate_hz,
            chunk_start,
            pcm.samples.len(),
            &pcm.samples,
        ));
    }
    Ok(out)
}

fn chunk_from(sr: u32, start: usize, end: usize, samples: &[f32]) -> VadChunk {
    let start_ms = samples_to_ms(sr, start);
    let end_ms = samples_to_ms(sr, end);
    VadChunk {
        start_ms,
        end_ms,
        samples: samples[start..end].to_vec(),
    }
}

pub fn samples_to_ms(sample_rate_hz: u32, index: usize) -> u64 {
    (index as u64 * 1000) / sample_rate_hz as u64
}

pub fn resample_linear(input: &PcmMono, target_hz: u32) -> Result<PcmMono, MediaError> {
    if input.samples.is_empty() {
        return Err(MediaError::Empty);
    }
    if input.sample_rate_hz == target_hz {
        return Ok(input.clone());
    }
    let ratio = target_hz as f64 / input.sample_rate_hz as f64;
    let out_len = ((input.samples.len() as f64) * ratio).round().max(1.0) as usize;
    let mut samples = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 / ratio;
        let i0 = src.floor() as usize;
        let i1 = (i0 + 1).min(input.samples.len() - 1);
        let t = (src - i0 as f64) as f32;
        let v = input.samples[i0] * (1.0 - t) + input.samples[i1] * t;
        samples.push(v);
    }
    Ok(PcmMono {
        sample_rate_hz: target_hz,
        samples,
    })
}

/// Bounded ring buffer policy for live capture (no disk by default).
#[derive(Debug)]
pub struct RingBuffer {
    capacity: usize,
    data: Vec<f32>,
    write: usize,
    filled: usize,
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            data: vec![0.0; capacity.max(1)],
            write: 0,
            filled: 0,
        }
    }

    pub fn push_slice(&mut self, samples: &[f32]) {
        for &s in samples {
            self.data[self.write] = s;
            self.write = (self.write + 1) % self.capacity;
            self.filled = (self.filled + 1).min(self.capacity);
        }
    }

    pub fn len_samples(&self) -> usize {
        self.filled
    }

    pub fn snapshot(&self) -> Vec<f32> {
        if self.filled == 0 {
            return Vec::new();
        }
        let mut out = Vec::with_capacity(self.filled);
        let start = if self.filled == self.capacity {
            self.write
        } else {
            0
        };
        for i in 0..self.filled {
            out.push(self.data[(start + i) % self.capacity]);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_and_vad() {
        let pcm = PcmMono {
            sample_rate_hz: 8_000,
            samples: (0..8000)
                .map(|i| if i % 40 < 20 { 0.5 } else { 0.0 })
                .collect(),
        };
        let r = resample_linear(&pcm, TARGET_SAMPLE_RATE_HZ).unwrap();
        assert_eq!(r.sample_rate_hz, 16_000);
        let chunks = energy_vad_chunks(&r, 30, 0.01).unwrap();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn capture_cancel_resume_ingest() {
        let mut q = CaptureJobQueue::default();
        let id = q.start("vid").id.clone();
        let pcm = f32_to_pcm_i16_le(&[0.1, -0.1, 0.2]);
        q.ingest_i16_le(AudioChunkIngest {
            job_id: id.clone(),
            sample_rate_hz: 16_000,
            pcm_i16_le: pcm.clone(),
            seq: 0,
        })
        .unwrap();
        q.pause(&id).unwrap();
        assert_eq!(
            q.ingest_i16_le(AudioChunkIngest {
                job_id: id.clone(),
                sample_rate_hz: 16_000,
                pcm_i16_le: pcm.clone(),
                seq: 1,
            })
            .unwrap(),
            1
        );
        q.resume(&id).unwrap();
        q.ingest_i16_le(AudioChunkIngest {
            job_id: id.clone(),
            sample_rate_hz: 16_000,
            pcm_i16_le: pcm,
            seq: 2,
        })
        .unwrap();
        q.cancel(&id).unwrap();
        assert!(matches!(
            q.ingest_i16_le(AudioChunkIngest {
                job_id: id,
                sample_rate_hz: 16_000,
                pcm_i16_le: vec![0, 0],
                seq: 3,
            }),
            Err(MediaError::Cancelled)
        ));
    }
}
