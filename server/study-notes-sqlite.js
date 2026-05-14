import { DatabaseSync } from "node:sqlite";

const studyNoteSchemaSql = `
  CREATE TABLE IF NOT EXISTS study_notes (
    object_id INTEGER NOT NULL,
    prompt_version TEXT NOT NULL,
    model TEXT NOT NULL,
    work_fingerprint TEXT NOT NULL,
    observe TEXT NOT NULL,
    context TEXT NOT NULL,
    technique TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (object_id, prompt_version, model, work_fingerprint)
  );
`;

function withDatabase(databasePath, work) {
  const database = new DatabaseSync(databasePath);

  try {
    return work(database);
  } finally {
    database.close();
  }
}

export function initializeStudyNotesSqlite(databasePath) {
  withDatabase(databasePath, (database) => {
    database.exec(studyNoteSchemaSql);
  });
}

export function getStudyNoteByKey({
  databasePath,
  objectId,
  promptVersion,
  model,
  workFingerprint
}) {
  return withDatabase(databasePath, (database) => {
    database.exec(studyNoteSchemaSql);

    const row = database
      .prepare(`
        SELECT observe, context, technique, sources_json AS sourcesJson
        FROM study_notes
        WHERE object_id = ?
          AND prompt_version = ?
          AND model = ?
          AND work_fingerprint = ?
      `)
      .get(objectId, promptVersion, model, workFingerprint);

    if (!row) {
      return null;
    }

    return {
      observe: row.observe,
      context: row.context,
      technique: row.technique,
      sources: JSON.parse(row.sourcesJson)
    };
  });
}

export function upsertStudyNote({
  databasePath,
  objectId,
  promptVersion,
  model,
  workFingerprint,
  note
}) {
  const now = new Date().toISOString();

  withDatabase(databasePath, (database) => {
    database.exec(studyNoteSchemaSql);
    database
      .prepare(`
        INSERT INTO study_notes (
          object_id,
          prompt_version,
          model,
          work_fingerprint,
          observe,
          context,
          technique,
          sources_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (object_id, prompt_version, model, work_fingerprint)
        DO UPDATE SET
          observe = excluded.observe,
          context = excluded.context,
          technique = excluded.technique,
          sources_json = excluded.sources_json,
          updated_at = excluded.updated_at
      `)
      .run(
        objectId,
        promptVersion,
        model,
        workFingerprint,
        note.observe,
        note.context,
        note.technique,
        JSON.stringify(note.sources),
        now,
        now
      );
  });

  return note;
}

export function listStudyNotes(databasePath) {
  return withDatabase(databasePath, (database) => {
    database.exec(studyNoteSchemaSql);

    return database
      .prepare(`
        SELECT
          study_notes.object_id AS objectId,
          COALESCE(objects.title, '') AS title,
          CASE
            WHEN COALESCE(objects.artist_display_name, '') <> '' THEN objects.artist_display_name
            WHEN COALESCE(objects.culture, '') <> '' THEN objects.culture
            ELSE 'Unknown'
          END AS artist,
          study_notes.prompt_version AS promptVersion,
          study_notes.model AS model,
          study_notes.observe AS observe,
          study_notes.context AS context,
          study_notes.technique AS technique,
          study_notes.sources_json AS sourcesJson,
          study_notes.created_at AS createdAt,
          study_notes.updated_at AS updatedAt
        FROM study_notes
        LEFT JOIN objects ON objects.object_id = study_notes.object_id
        ORDER BY study_notes.updated_at DESC, study_notes.object_id DESC
      `)
      .all()
      .map((row) => ({
        objectId: row.objectId,
        title: row.title,
        artist: row.artist,
        promptVersion: row.promptVersion,
        model: row.model,
        observe: row.observe,
        context: row.context,
        technique: row.technique,
        sources: JSON.parse(row.sourcesJson),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }));
  });
}
