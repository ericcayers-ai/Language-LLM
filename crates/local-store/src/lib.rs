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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetentionPreset {
    Session,
    Days7,
    Days30,
    Keep,
}

impl RetentionPreset {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "session" => Some(Self::Session),
            "days7" => Some(Self::Days7),
            "days30" => Some(Self::Days30),
            "keep" => Some(Self::Keep),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Session => "session",
            Self::Days7 => "days7",
            Self::Days30 => "days30",
            Self::Keep => "keep",
        }
    }
}

pub fn retention_ttl_ms(preset: RetentionPreset) -> Option<u64> {
    match preset {
        RetentionPreset::Session => Some(0),
        RetentionPreset::Days7 => Some(7 * 24 * 60 * 60 * 1000),
        RetentionPreset::Days30 => Some(30 * 24 * 60 * 60 * 1000),
        RetentionPreset::Keep => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrivacyWipeScope {
    All,
    Transcripts,
    Translations,
    Lyrics,
    PageCache,
    Study,
    Dictionaries,
}

impl PrivacyWipeScope {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "all" => Some(Self::All),
            "transcripts" => Some(Self::Transcripts),
            "translations" => Some(Self::Translations),
            "lyrics" => Some(Self::Lyrics),
            "page-cache" => Some(Self::PageCache),
            "study" => Some(Self::Study),
            "dictionaries" => Some(Self::Dictionaries),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Transcripts => "transcripts",
            Self::Translations => "translations",
            Self::Lyrics => "lyrics",
            Self::PageCache => "page-cache",
            Self::Study => "study",
            Self::Dictionaries => "dictionaries",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationRecord {
    pub cues_json: String,
    pub revision_id: String,
    pub model_id: String,
    pub model_revision: String,
    pub target_lang: String,
    pub source_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StudyRecord {
    pub id: String,
    pub kind: String,
    pub payload_json: String,
    pub updated_at_ms: i64,
    /// Optional clip window anchored to the source cue (ms).
    pub video_clip_start_ms: Option<i64>,
    pub video_clip_end_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WordStatusRow {
    pub surface: String,
    pub status: String,
    pub encounters: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryMeta {
    pub id: String,
    pub name: String,
    pub language: String,
    pub license: String,
    pub entry_count: i64,
    pub payload_path: String,
    pub imported_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DictionaryLookupHit {
    pub entry_id: String,
    pub dictionary_id: String,
    pub surface: String,
    pub reading: Option<String>,
    pub glossary_json: Option<String>,
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

const MIGRATION_V2: &str = r#"
CREATE TABLE IF NOT EXISTS dictionaries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  license TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  payload_path TEXT NOT NULL,
  imported_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dictionary_entries (
  id TEXT PRIMARY KEY NOT NULL,
  dictionary_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  reading TEXT,
  glossary_json TEXT,
  FOREIGN KEY (dictionary_id) REFERENCES dictionaries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dict_surface ON dictionary_entries(surface);
CREATE TABLE IF NOT EXISTS prefs (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
"#;

const MIGRATION_V3: &str = r#"
ALTER TABLE study_data ADD COLUMN video_clip_start_ms INTEGER;
ALTER TABLE study_data ADD COLUMN video_clip_end_ms INTEGER;
CREATE TABLE IF NOT EXISTS word_status (
  surface TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  encounters INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_word_status_status ON word_status(status);
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
        if current < 2 {
            self.conn.execute_batch(MIGRATION_V2)?;
            let now = now_ms();
            self.conn.execute(
                "INSERT INTO schema_migrations (version, applied_at_ms) VALUES (2, ?1)",
                params![now],
            )?;
        }
        if current < 3 {
            self.conn.execute_batch(MIGRATION_V3)?;
            let now = now_ms();
            self.conn.execute(
                "INSERT INTO schema_migrations (version, applied_at_ms) VALUES (3, ?1)",
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

    pub fn get_latest_transcript(&self, video_id: &str) -> Result<Option<String>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT timeline_json FROM transcripts WHERE video_id=?1
                 ORDER BY updated_at_ms DESC LIMIT 1",
                params![video_id],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(row)
    }

    #[allow(clippy::too_many_arguments)]
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

    #[allow(clippy::too_many_arguments)]
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

    pub fn put_study(
        &self,
        id: &str,
        kind: &str,
        payload_json: &str,
        video_clip_start_ms: Option<i64>,
        video_clip_end_ms: Option<i64>,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO study_data
                (id, kind, payload_json, video_clip_start_ms, video_clip_end_ms, updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind, payload_json=excluded.payload_json,
               video_clip_start_ms=excluded.video_clip_start_ms,
               video_clip_end_ms=excluded.video_clip_end_ms,
               updated_at_ms=excluded.updated_at_ms",
            params![
                id,
                kind,
                payload_json,
                video_clip_start_ms,
                video_clip_end_ms,
                now_ms()
            ],
        )?;
        Ok(())
    }

    pub fn get_study_with_clip(&self, id: &str) -> Result<Option<StudyRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT id, kind, payload_json, updated_at_ms,
                        video_clip_start_ms, video_clip_end_ms
                 FROM study_data WHERE id=?1",
                params![id],
                |r| {
                    Ok(StudyRecord {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        payload_json: r.get(2)?,
                        updated_at_ms: r.get(3)?,
                        video_clip_start_ms: r.get(4)?,
                        video_clip_end_ms: r.get(5)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn put_word_status(&self, row: &WordStatusRow) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO word_status (surface, status, encounters, updated_at_ms)
             VALUES (?1,?2,?3,?4)
             ON CONFLICT(surface) DO UPDATE SET
               status=excluded.status,
               encounters=excluded.encounters,
               updated_at_ms=excluded.updated_at_ms",
            params![row.surface, row.status, row.encounters, row.updated_at_ms],
        )?;
        Ok(())
    }

    pub fn list_word_status(&self) -> Result<Vec<WordStatusRow>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT surface, status, encounters, updated_at_ms
             FROM word_status ORDER BY updated_at_ms DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(WordStatusRow {
                    surface: r.get(0)?,
                    status: r.get(1)?,
                    encounters: r.get(2)?,
                    updated_at_ms: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn word_status_histogram(&self) -> Result<Vec<(String, i64)>, StoreError> {
        let mut stmt = self
            .conn
            .prepare("SELECT status, COUNT(*) FROM word_status GROUP BY status")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_translation(
        &self,
        video_id: &str,
        source_hash: Option<&str>,
    ) -> Result<Option<TranslationRecord>, StoreError> {
        let row = if let Some(hash) = source_hash {
            self.conn
                .query_row(
                    "SELECT cues_json, revision_id, model_id, model_revision, target_lang, source_hash
                     FROM translations
                     WHERE video_id=?1 AND source_hash=?2
                     ORDER BY updated_at_ms DESC LIMIT 1",
                    params![video_id, hash],
                    |r| {
                        Ok(TranslationRecord {
                            cues_json: r.get(0)?,
                            revision_id: r.get(1)?,
                            model_id: r.get(2)?,
                            model_revision: r.get(3)?,
                            target_lang: r.get(4)?,
                            source_hash: r.get(5)?,
                        })
                    },
                )
                .optional()?
        } else {
            self.conn
                .query_row(
                    "SELECT cues_json, revision_id, model_id, model_revision, target_lang, source_hash
                     FROM translations
                     WHERE video_id=?1
                     ORDER BY updated_at_ms DESC LIMIT 1",
                    params![video_id],
                    |r| {
                        Ok(TranslationRecord {
                            cues_json: r.get(0)?,
                            revision_id: r.get(1)?,
                            model_id: r.get(2)?,
                            model_revision: r.get(3)?,
                            target_lang: r.get(4)?,
                            source_hash: r.get(5)?,
                        })
                    },
                )
                .optional()?
        };
        Ok(row)
    }

    pub fn delete_transcripts_for_video(&self, video_id: &str) -> Result<usize, StoreError> {
        let n = self.conn.execute(
            "DELETE FROM transcripts WHERE video_id=?1",
            params![video_id],
        )?;
        Ok(n)
    }

    pub fn get_study(&self, id: &str) -> Result<Option<StudyRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT id, kind, payload_json, updated_at_ms,
                        video_clip_start_ms, video_clip_end_ms
                 FROM study_data WHERE id=?1",
                params![id],
                |r| {
                    Ok(StudyRecord {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        payload_json: r.get(2)?,
                        updated_at_ms: r.get(3)?,
                        video_clip_start_ms: r.get(4)?,
                        video_clip_end_ms: r.get(5)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn list_study_by_kind(&self, kind: &str) -> Result<Vec<StudyRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, payload_json, updated_at_ms,
                    video_clip_start_ms, video_clip_end_ms
             FROM study_data WHERE kind=?1 ORDER BY updated_at_ms DESC",
        )?;
        let rows = stmt
            .query_map(params![kind], |r| {
                Ok(StudyRecord {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    payload_json: r.get(2)?,
                    updated_at_ms: r.get(3)?,
                    video_clip_start_ms: r.get(4)?,
                    video_clip_end_ms: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_study(&self, id: &str) -> Result<bool, StoreError> {
        let n = self
            .conn
            .execute("DELETE FROM study_data WHERE id=?1", params![id])?;
        Ok(n > 0)
    }

    pub fn clear_page_cache(&self, canonical_url: Option<&str>) -> Result<usize, StoreError> {
        let n = if let Some(url) = canonical_url {
            self.conn.execute(
                "DELETE FROM page_translate_cache WHERE canonical_url=?1",
                params![url],
            )?
        } else {
            self.conn.execute("DELETE FROM page_translate_cache", [])?
        };
        Ok(n)
    }

    pub fn privacy_wipe(
        &self,
        scope: PrivacyWipeScope,
    ) -> Result<HashMap<String, usize>, StoreError> {
        let mut cleared = HashMap::new();
        let wipe = |table: &str| -> Result<usize, StoreError> {
            let n = self.conn.execute(&format!("DELETE FROM {table}"), [])?;
            Ok(n)
        };
        match scope {
            PrivacyWipeScope::All => {
                cleared.insert("transcripts".into(), wipe("transcripts")?);
                cleared.insert("translations".into(), wipe("translations")?);
                cleared.insert("lyrics".into(), wipe("lyrics_cache")?);
                cleared.insert("page-cache".into(), wipe("page_translate_cache")?);
                cleared.insert("study".into(), wipe("study_data")?);
                cleared.insert("dictionaries".into(), wipe("dictionary_entries")?);
                let _ = wipe("dictionaries")?;
            }
            PrivacyWipeScope::Transcripts => {
                cleared.insert("transcripts".into(), wipe("transcripts")?);
            }
            PrivacyWipeScope::Translations => {
                cleared.insert("translations".into(), wipe("translations")?);
            }
            PrivacyWipeScope::Lyrics => {
                cleared.insert("lyrics".into(), wipe("lyrics_cache")?);
            }
            PrivacyWipeScope::PageCache => {
                cleared.insert("page-cache".into(), wipe("page_translate_cache")?);
            }
            PrivacyWipeScope::Study => {
                cleared.insert("study".into(), wipe("study_data")?);
            }
            PrivacyWipeScope::Dictionaries => {
                let entries = wipe("dictionary_entries")?;
                let dicts = wipe("dictionaries")?;
                cleared.insert("dictionaries".into(), entries + dicts);
            }
        }
        Ok(cleared)
    }

    pub fn put_dictionary_meta(&self, meta: &DictionaryMeta) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO dictionaries (id, name, language, license, entry_count, payload_path, imported_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, language=excluded.language, license=excluded.license,
               entry_count=excluded.entry_count, payload_path=excluded.payload_path,
               imported_at_ms=excluded.imported_at_ms",
            params![
                meta.id,
                meta.name,
                meta.language,
                meta.license,
                meta.entry_count,
                meta.payload_path,
                meta.imported_at_ms
            ],
        )?;
        Ok(())
    }

    pub fn get_dictionary_meta(&self, id: &str) -> Result<Option<DictionaryMeta>, StoreError> {
        let row = self
            .conn
            .query_row(
                "SELECT id, name, language, license, entry_count, payload_path, imported_at_ms
                 FROM dictionaries WHERE id=?1",
                params![id],
                |r| {
                    Ok(DictionaryMeta {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        language: r.get(2)?,
                        license: r.get(3)?,
                        entry_count: r.get(4)?,
                        payload_path: r.get(5)?,
                        imported_at_ms: r.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn put_dictionary_entries(
        &self,
        dictionary_id: &str,
        entries: &[(String, String, Option<String>, Option<String>)],
    ) -> Result<usize, StoreError> {
        let tx = self.conn.unchecked_transaction()?;
        let mut n = 0usize;
        for (entry_id, surface, reading, glossary_json) in entries {
            tx.execute(
                "INSERT INTO dictionary_entries (id, dictionary_id, surface, reading, glossary_json)
                 VALUES (?1,?2,?3,?4,?5)
                 ON CONFLICT(id) DO UPDATE SET
                   surface=excluded.surface, reading=excluded.reading,
                   glossary_json=excluded.glossary_json",
                params![entry_id, dictionary_id, surface, reading, glossary_json],
            )?;
            n += 1;
        }
        tx.commit()?;
        Ok(n)
    }

    pub fn lookup_dictionary(&self, surface: &str) -> Result<Vec<DictionaryLookupHit>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, dictionary_id, surface, reading, glossary_json
             FROM dictionary_entries WHERE surface=?1 LIMIT 50",
        )?;
        let rows = stmt
            .query_map(params![surface], |r| {
                Ok(DictionaryLookupHit {
                    entry_id: r.get(0)?,
                    dictionary_id: r.get(1)?,
                    surface: r.get(2)?,
                    reading: r.get(3)?,
                    glossary_json: r.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn clear_dictionaries(&self) -> Result<usize, StoreError> {
        let n_entries = self.conn.execute("DELETE FROM dictionary_entries", [])?;
        let n_dicts = self.conn.execute("DELETE FROM dictionaries", [])?;
        Ok(n_entries + n_dicts)
    }

    pub fn dictionary_stats(&self) -> Result<(usize, usize), StoreError> {
        let dicts: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM dictionaries", [], |r| r.get(0))?;
        let entries: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM dictionary_entries", [], |r| r.get(0))?;
        Ok((dicts as usize, entries as usize))
    }

    pub fn list_dictionaries(&self) -> Result<Vec<DictionaryMeta>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, language, license, entry_count, payload_path, imported_at_ms
             FROM dictionaries ORDER BY name ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DictionaryMeta {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    language: r.get(2)?,
                    license: r.get(3)?,
                    entry_count: r.get(4)?,
                    payload_path: r.get(5)?,
                    imported_at_ms: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Approximate on-disk size of the SQLite file (and WAL/SHM siblings when present).
    pub fn database_disk_bytes(&self) -> u64 {
        let path = self.path();
        let mut total = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        for suffix in ["-wal", "-shm"] {
            let alt = PathBuf::from(format!("{}{suffix}", path.display()));
            if let Ok(meta) = std::fs::metadata(&alt) {
                total = total.saturating_add(meta.len());
            }
        }
        total
    }

    pub fn set_retention_preset(&self, preset: RetentionPreset) -> Result<(), StoreError> {
        self.conn.execute(
            "INSERT INTO prefs (key, value) VALUES ('retention_preset', ?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![preset.as_str()],
        )?;
        Ok(())
    }

    pub fn get_retention_preset(&self) -> Result<RetentionPreset, StoreError> {
        let row: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM prefs WHERE key='retention_preset'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(row
            .and_then(|s| RetentionPreset::parse(&s))
            .unwrap_or(RetentionPreset::Days7))
    }

    pub fn purge_expired(&self, now_ms: i64) -> Result<HashMap<String, usize>, StoreError> {
        let preset = self.get_retention_preset()?;
        let Some(ttl) = retention_ttl_ms(preset) else {
            return Ok(HashMap::new());
        };
        if ttl == 0 {
            return Ok(HashMap::new());
        }
        let cutoff = now_ms - ttl as i64;
        let mut purged = HashMap::new();
        purged.insert(
            "transcripts".into(),
            self.conn.execute(
                "DELETE FROM transcripts WHERE updated_at_ms < ?1",
                params![cutoff],
            )?,
        );
        purged.insert(
            "translations".into(),
            self.conn.execute(
                "DELETE FROM translations WHERE updated_at_ms < ?1",
                params![cutoff],
            )?,
        );
        purged.insert(
            "page-cache".into(),
            self.conn.execute(
                "DELETE FROM page_translate_cache WHERE updated_at_ms < ?1",
                params![cutoff],
            )?,
        );
        purged.insert(
            "study".into(),
            self.conn.execute(
                "DELETE FROM study_data WHERE updated_at_ms < ?1",
                params![cutoff],
            )?,
        );
        purged.insert(
            "lyrics".into(),
            self.conn.execute(
                "DELETE FROM lyrics_cache WHERE fetched_at_ms < ?1",
                params![cutoff],
            )?,
        );
        Ok(purged)
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
        let tr = store
            .get_translation("vid", Some("hash1"))
            .unwrap()
            .unwrap();
        assert_eq!(tr.revision_id, "rev1");
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
            .put_study("card1", "fsrs", r#"{"due":1}"#, None, None)
            .unwrap();
        let study = store.get_study("card1").unwrap().unwrap();
        assert_eq!(study.kind, "fsrs");
        assert_eq!(study.video_clip_start_ms, None);
        assert_eq!(store.list_study_by_kind("fsrs").unwrap().len(), 1);
        assert!(store.delete_study("card1").unwrap());
        assert_eq!(store.clear_lyrics_prefix("lyrics|vid|").unwrap(), 1);
        assert_eq!(store.delete_transcripts_for_video("vid").unwrap(), 1);
        store.set_retention_preset(RetentionPreset::Days7).unwrap();
        assert_eq!(
            store.get_retention_preset().unwrap(),
            RetentionPreset::Days7
        );
    }

    #[test]
    fn privacy_wipe_and_dictionary_lookup() {
        let store = SqliteStore::open_in_memory().unwrap();
        store.put_transcript("v1", "h1", r#"{"cues":[]}"#).unwrap();
        store
            .put_study("s1", "note", r#"{"x":1}"#, None, None)
            .unwrap();
        let meta = DictionaryMeta {
            id: "dict1".into(),
            name: "Test".into(),
            language: "ja".into(),
            license: "CC".into(),
            entry_count: 1,
            payload_path: "/tmp/dict".into(),
            imported_at_ms: now_ms(),
        };
        store.put_dictionary_meta(&meta).unwrap();
        store
            .put_dictionary_entries(
                "dict1",
                &[("e1".into(), "hello".into(), Some("ハロー".into()), None)],
            )
            .unwrap();
        let hits = store.lookup_dictionary("hello").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].reading.as_deref(), Some("ハロー"));
        let (dicts, entries) = store.dictionary_stats().unwrap();
        assert_eq!(dicts, 1);
        assert_eq!(entries, 1);
        let cleared = store.privacy_wipe(PrivacyWipeScope::Transcripts).unwrap();
        assert_eq!(cleared.get("transcripts").copied(), Some(1));
        assert!(store.get_transcript("v1", "h1").unwrap().is_none());
        let all = store.privacy_wipe(PrivacyWipeScope::All).unwrap();
        assert!(all.get("study").copied().unwrap_or(0) >= 1);
    }
}
