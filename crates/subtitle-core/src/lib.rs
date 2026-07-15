//! Cue alignment, segmentation, sync, import/export (SRT/VTT/LRC), QC.

#![deny(unsafe_code)]

use language_llm_protocol::Cue;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SubtitleError {
    #[error("invalid cue timing: start={start_ms} end={end_ms}")]
    InvalidTiming { start_ms: u64, end_ms: u64 },
    #[error("empty cue text")]
    EmptyText,
}

pub fn validate_cue(cue: &Cue) -> Result<(), SubtitleError> {
    if cue.end_ms <= cue.start_ms {
        return Err(SubtitleError::InvalidTiming {
            start_ms: cue.start_ms,
            end_ms: cue.end_ms,
        });
    }
    if cue.text.trim().is_empty() {
        return Err(SubtitleError::EmptyText);
    }
    Ok(())
}

pub fn cue_duration_ms(cue: &Cue) -> u64 {
    cue.end_ms.saturating_sub(cue.start_ms)
}

pub fn characters_per_second(cue: &Cue) -> f64 {
    let dur = cue_duration_ms(cue).max(1) as f64 / 1000.0;
    cue.text.chars().count() as f64 / dur
}

pub fn clip_overlap_ms(a: &Cue, b: &Cue) -> u64 {
    let start = a.start_ms.max(b.start_ms);
    let end = a.end_ms.min(b.end_ms);
    end.saturating_sub(start)
}

pub fn to_srt(cues: &[Cue]) -> String {
    let mut out = String::new();
    for (i, c) in cues.iter().enumerate() {
        out.push_str(&(i + 1).to_string());
        out.push('\n');
        out.push_str(&format!(
            "{} --> {}\n",
            fmt_ts(c.start_ms),
            fmt_ts(c.end_ms)
        ));
        out.push_str(&c.text);
        out.push_str("\n\n");
    }
    out
}

pub fn to_vtt(cues: &[Cue]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for c in cues {
        out.push_str(&format!(
            "{} --> {}\n{}\n\n",
            fmt_ts_vtt(c.start_ms),
            fmt_ts_vtt(c.end_ms),
            c.text
        ));
    }
    out
}

pub fn to_lrc(cues: &[Cue]) -> String {
    let mut out = String::new();
    for c in cues {
        let total_cs = c.start_ms / 10;
        let mm = total_cs / 6000;
        let ss = (total_cs / 100) % 60;
        let cs = total_cs % 100;
        out.push_str(&format!("[{mm:02}:{ss:02}.{cs:02}]{}\n", c.text));
    }
    out
}

fn fmt_ts(ms: u64) -> String {
    let h = ms / 3_600_000;
    let m = (ms / 60_000) % 60;
    let s = (ms / 1000) % 60;
    let milli = ms % 1000;
    format!("{h:02}:{m:02}:{s:02},{milli:03}")
}

fn fmt_ts_vtt(ms: u64) -> String {
    fmt_ts(ms).replace(',', ".")
}

pub struct QcReport {
    pub ok: bool,
    pub cps_violations: usize,
    pub empty_cues: usize,
}

pub fn qc_cues(cues: &[Cue], max_cps: f64) -> QcReport {
    let mut cps_violations = 0;
    let mut empty_cues = 0;
    for c in cues {
        if c.text.trim().is_empty() {
            empty_cues += 1;
        }
        if characters_per_second(c) > max_cps {
            cps_violations += 1;
        }
    }
    QcReport {
        ok: cps_violations == 0 && empty_cues == 0,
        cps_violations,
        empty_cues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use language_llm_protocol::Provenance;

    fn cue(start: u64, end: u64, text: &str) -> Cue {
        Cue {
            id: "1".into(),
            start_ms: start,
            end_ms: end,
            text: text.into(),
            speaker: None,
            provenance: Provenance::HumanCaption,
        }
    }

    #[test]
    fn srt_and_cps() {
        let c = cue(0, 1000, "hello");
        assert!(validate_cue(&c).is_ok());
        assert!(characters_per_second(&c) > 0.0);
        let srt = to_srt(std::slice::from_ref(&c));
        assert!(srt.contains("-->"));
        let lrc = to_lrc(&[c]);
        assert!(lrc.starts_with('['));
    }
}
