//! Local store: SQLite migrations + in-memory facade for tests.

#![deny(unsafe_code)]

use language_llm_protocol::{JobId, VideoId};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("storage error: {0}")]
    Io(String),
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentHash(pub String);

pub fn new_job_id() -> JobId {
    Uuid::new_v4().to_string()
}

pub fn cache_key(video_id: &VideoId, layer: &str) -> String {
    format!("{video_id}:{layer}")
}

pub fn page_translate_cache_key(
    canonical_url: &str,
    model_id: &str,
    model_revision: &str,
    source_lang: &str,
    target_lang: &str,
    segment_hash: &str,
) -> String {
    format!(
        "page|{canonical_url}|{model_id}|{model_revision}|{source_lang}|{target_lang}|{segment_hash}"
    )
}

pub fn lyrics_cache_key(video_id: &VideoId, source: &str) -> String {
    format!("lyrics|{video_id}|{source}")
}

#[derive(Debug, Default)]
pub struct MemoryStore {
    kv: HashMap<String, String>,
    attribution: HashMap<String, String>,
}

impl MemoryStore {
    pub fn put(&mut self, key: String, value: String) {
        self.kv.insert(key, value);
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.kv.get(key)
    }

    pub fn put_lyrics(&mut self, key: String, value: String, attribution: String) {
        self.kv.insert(key.clone(), value);
        self.attribution.insert(key, attribution);
    }

    pub fn clear_prefix(&mut self, prefix: &str) -> usize {
        let keys: Vec<_> = self
            .kv
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        let n = keys.len();
        for k in keys {
            self.kv.remove(&k);
            self.attribution.remove(&k);
        }
        n
    }

    pub fn clear_all(&mut self) {
        self.kv.clear();
        self.attribution.clear();
    }
}

#[derive(Debug, Clone, Copy)]
pub enum RetentionPreset {
    Session,
    Days7,
    Days30,
    Keep,
}

pub fn retention_ttl_ms(preset: RetentionPreset) -> Option<u64> {
    match preset {
        RetentionPreset::Session => Some(0),
        RetentionPreset::Days7 => Some(7 * 24 * 60 * 60 * 1000),
        RetentionPreset::Days30 => Some(30 * 24 * 60 * 60 * 1000),
        RetentionPreset::Keep => None,
    }
}

const MIGRATION_V1: &str = r#"
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transcripts (
  video_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (video_id, source_hash)
);
CREATE TABLE IF NOT EXISTS translations (
  video_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  cues_json TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (video_id, source_hash, model_id, model_revision, target_lang)
);
CREATE TABLE IF NOT EXISTS lyrics_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT NOT NULL,
  attribution TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS page_translate_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  canonical_url TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  segment_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS study_data (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lyrics_video ON lyrics_cache(video_id);
CREATE INDEX IF NOT EXISTS idx_page_url ON page_translate_cache(canonical_url);
CREATE INDEX IF NOT EXISTS idx_study_kind ON study_data(kind);
"#;

/// SQLite-backed local store with schema migrations.
pub struct SqliteStore {
    conn: Connection,
    path: PathBuf,
}

impl SqliteStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| StoreError::Io(e.to_string()))?;
        }
        let conn = Connection::open(&path)?;
        let mut store = Self { conn, path };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        let mut store = Self {
            conn,
            path: PathBuf::from(":memory:"),
        };
        store.migrate()?;
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate(&mut self) -> Result<(), StoreError> {
        self.conn.execute_batch(MIGRATION_V1)?;
        let current: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if current < 1 {
            let now = now_ms();
            self.conn.execute(
                "INSERT INTO schema_migrations (version, applied_at_ms) VALUES (1, ?1)",
                params![now],
            )?;
        }
        Ok(())
    }

    pub fn put_transcript(
        &self,
        video_id: &str,
        source_hash: &str,
        timeline_json: &str,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO transcripts (video_id, source_hash, timeline_json, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(video_id, source_hash) DO UPDATE SET
               timeline_json=excluded.timeline_json,
               updated_at_ms=excluded.updated_at_ms",
            params![video_id, source_hash, timeline_json, now_ms()],
        )?;
        Ok(())
    }

    pub fn get_transcript(
        &self,
        video_id: &str,
        source_hash: &str,
    ) -> Result<Option<String>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT timeline_json FROM transcripts WHERE video_id=?1 AND source_hash=?2",
                params![video_id, source_hash],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(row)
    }

    pub fn put_translation(
        &self,
        video_id: &str,
        source_hash: &str,
        model_id: &str,
        model_revision: &str,
        target_lang: &str,
        cues_json: &str,
        revision_id: &str,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO translations (
               video_id, source_hash, model_id, model_revision, target_lang,
               cues_json, revision_id, updated_at_ms
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(video_id, source_hash, model_id, model_revision, target_lang)
             DO UPDATE SET cues_json=excluded.cues_json, revision_id=excluded.revision_id,
               updated_at_ms=excluded.updated_at_ms",
            params![
                video_id,
                source_hash,
                model_id,
                model_revision,
                target_lang,
                cues_json,
                revision_id,
                now_ms()
            ],
        )?;
        Ok(())
    }

    pub fn put_lyrics(
        &self,
        key: &str,
        video_id: &str,
        source: &str,
        body: &str,
        attribution: &str,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO lyrics_cache (cache_key, video_id, source, body, attribution, fetched_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(cache_key) DO UPDATE SET
               body=excluded.body, attribution=excluded.attribution,
               fetched_at_ms=excluded.fetched_at_ms",
            params![key, video_id, source, body, attribution, now_ms()],
        )?;
        Ok(())
    }

    pub fn get_lyrics(&self, key: &str) -> Result<Option<(String, String)>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT body, attribution FROM lyrics_cache WHERE cache_key=?1",
                params![key],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?;
        Ok(row)
    }

    pub fn clear_lyrics_prefix(&self, prefix: &str) -> Result<usize, StoreError> {
        let n = self.conn.execute(
            "DELETE FROM lyrics_cache WHERE cache_key LIKE ?1",
            params![format!("{prefix}%")],
        )?;
        Ok(n)
    }

    pub fn put_page_segment(
        &self,
        key: &str,
        canonical_url: &str,
        model_id: &str,
        model_revision: &str,
        source_lang: &str,
        target_lang: &str,
        segment_hash: &str,
        translated_text: &str,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO page_translate_cache (
               cache_key, canonical_url, model_id, model_revision,
               source_lang, target_lang, segment_hash, translated_text, updated_at_ms
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(cache_key) DO UPDATE SET
               translated_text=excluded.translated_text,
               updated_at_ms=excluded.updated_at_ms",
            params![
                key,
                canonical_url,
                model_id,
                model_revision,
                source_lang,
                target_lang,
                segment_hash,
                translated_text,
                now_ms()
            ],
        )?;
        Ok(())
    }

    pub fn get_page_segment(&self, key: &str) -> Result<Option<String>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT translated_text FROM page_translate_cache WHERE cache_key=?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(row)
    }

    pub fn put_study(&self, id: &str, kind: &str, payload_json: &str) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO study_data (id, kind, payload_json, updated_at_ms)
             VALUES (?1,?2,?3,?4)
             ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind, payload_json=excluded.payload_json,
               updated_at_ms=excluded.updated_at_ms",
            params![id, kind, payload_json, now_ms()],
        )?;
        Ok(())
    }

    pub fn clear_all_caches(&self) -> Result<(), StoreError> {
        self.conn.execute_batch(
            "DELETE FROM transcripts;
             DELETE FROM translations;
             DELETE FROM lyrics_cache;
             DELETE FROM page_translate_cache;",
        )?;
        Ok(())
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_and_lyrics_keys() {
        let k = page_translate_cache_key("https://a", "hy", "r1", "en", "ja", "h");
        assert!(k.starts_with("page|"));
        let mut s = MemoryStore::default();
        s.put_lyrics(
            lyrics_cache_key(&"v".into(), "lrclib"),
            "x".into(),
            "LRCLIB".into(),
        );
        assert_eq!(s.clear_prefix("lyrics|"), 1);
    }

    #[test]
    fn sqlite_migrations_and_caches() {
        let store = SqliteStore::open_in_memory().unwrap();
        store
            .put_transcript("vid", "hash1", r#"{"cues":[]}"#)
            .unwrap();
        assert!(store.get_transcript("vid", "hash1").unwrap().is_some());
        store
            .put_translation("vid", "hash1", "mock", "1", "ja", "[]", "rev1")
            .unwrap();
        let key = lyrics_cache_key(&"vid".into(), "lrclib");
        store
            .put_lyrics(&key, "vid", "lrclib", "[00:01.00]hi", "LRCLIB")
            .unwrap();
        assert!(store.get_lyrics(&key).unwrap().is_some());
        let page_key = page_translate_cache_key("https://a", "mock", "1", "en", "ja", "abc");
        store
            .put_page_segment(
                &page_key,
                "https://a",
                "mock",
                "1",
                "en",
                "ja",
                "abc",
                "こんにちは",
            )
            .unwrap();
        assert_eq!(
            store.get_page_segment(&page_key).unwrap().as_deref(),
            Some("こんにちは")
        );
        store
            .put_study("card1", "fsrs", r#"{"due":1}"#)
            .unwrap();
        assert_eq!(store.clear_lyrics_prefix("lyrics|vid|").unwrap(), 1);
    }
}
