import { createHash } from "node:crypto";
import { getStudyNoteByKey, upsertStudyNote } from "./study-notes-sqlite.js";
import { defaultPromptVersion } from "./work-ai.js";

function trimValue(value) {
  return String(value ?? "").trim();
}

function sanitizeSource(source) {
  return {
    startIndex: Number.isFinite(source?.startIndex) ? source.startIndex : 0,
    endIndex: Number.isFinite(source?.endIndex) ? source.endIndex : 0,
    url: trimValue(source?.url),
    title: trimValue(source?.title)
  };
}

function sanitizeNote(note) {
  return {
    observe: trimValue(note?.observe),
    context: trimValue(note?.context),
    technique: trimValue(note?.technique),
    sources: Array.isArray(note?.sources)
      ? note.sources.map(sanitizeSource).filter((source) => source.url)
      : []
  };
}

function buildWorkFingerprint(work) {
  const payload = {
    title: trimValue(work?.title),
    artist: trimValue(work?.artist),
    date: trimValue(work?.date),
    context: trimValue(work?.context),
    imageUrl: trimValue(work?.imageUrl),
    metUrl: trimValue(work?.metUrl)
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildKey({ objectId, promptVersion, model, workFingerprint }) {
  return `${objectId}:${promptVersion}:${model}:${workFingerprint}`;
}

export function createStudyNoteService({
  databasePath = null,
  loadWorkByObjectId,
  workInfoGenerator,
  logger = console
}) {
  const inFlightRequests = new Map();

  if (!workInfoGenerator?.explainWorkForArtStudent || typeof loadWorkByObjectId !== "function") {
    return null;
  }

  const promptVersion = trimValue(workInfoGenerator.promptVersion) || defaultPromptVersion;
  const model = trimValue(workInfoGenerator.model) || "unknown";

  function logStudyEvent(eventType, fields) {
    logger.info?.(
      JSON.stringify({
        eventType,
        ...fields
      })
    );
  }

  function createInFlightEntry({ cacheKey, inFlightKey, objectId, work, forceRefresh }) {
    const entry = {
      forced: forceRefresh,
      superseded: false,
      promise: null
    };

    entry.promise = (async () => {
      const generationStartedAt = Date.now();
      const note = sanitizeNote(await workInfoGenerator.explainWorkForArtStudent(work));
      const shouldPersist = databasePath && !entry.superseded;

      if (shouldPersist) {
        upsertStudyNote({
          databasePath,
          objectId,
          promptVersion,
          model,
          workFingerprint: cacheKey.workFingerprint,
          note
        });
      }

      logStudyEvent(forceRefresh ? "study_note_admin_refresh" : "study_note_generated", {
        objectId,
        promptVersion,
        model,
        fingerprint: cacheKey.workFingerprint.slice(0, 12),
        cacheHit: false,
        forced: forceRefresh,
        coalesced: false,
        generationMs: Date.now() - generationStartedAt,
        persisted: Boolean(shouldPersist)
      });

      return {
        note,
        meta: {
          cacheHit: false,
          forcedRefresh: forceRefresh,
          coalesced: false
        }
      };
    })().finally(() => {
      if (inFlightRequests.get(inFlightKey) === entry) {
        inFlightRequests.delete(inFlightKey);
      }
    });

    return entry;
  }

  return {
    async getStudyNote({ objectId, forceRefresh = false } = {}) {
      const work = await loadWorkByObjectId(objectId);

      if (!work) {
        return null;
      }

      const workFingerprint = buildWorkFingerprint(work);
      const cacheKey = { objectId, promptVersion, model, workFingerprint };
      const inFlightKey = buildKey(cacheKey);
      const lookupStartedAt = Date.now();

      while (true) {
        if (!forceRefresh && databasePath) {
          const cachedNote = getStudyNoteByKey({
            databasePath,
            objectId,
            promptVersion,
            model,
            workFingerprint
          });

          if (cachedNote) {
            logStudyEvent("study_note_cache_hit", {
              objectId,
              promptVersion,
              model,
              fingerprint: workFingerprint.slice(0, 12),
              cacheHit: true,
              forced: false,
              coalesced: false,
              lookupMs: Date.now() - lookupStartedAt,
              persisted: true
            });

            return {
              note: cachedNote,
              meta: {
                cacheHit: true,
                forcedRefresh: false,
                coalesced: false
              }
            };
          }
        }

        let entry = inFlightRequests.get(inFlightKey);
        let createdByCurrentRequest = false;

        if (entry) {
          if (forceRefresh && !entry.forced) {
            entry.superseded = true;
            logStudyEvent("study_note_cache_miss", {
              objectId,
              promptVersion,
              model,
              fingerprint: workFingerprint.slice(0, 12),
              cacheHit: false,
              forced: true,
              coalesced: false,
              lookupMs: Date.now() - lookupStartedAt,
              persisted: Boolean(databasePath)
            });
            entry = createInFlightEntry({
              cacheKey,
              inFlightKey,
              objectId,
              work,
              forceRefresh: true
            });
            inFlightRequests.set(inFlightKey, entry);
            createdByCurrentRequest = true;
          } else {
            logStudyEvent("study_note_coalesced_wait", {
              objectId,
              promptVersion,
              model,
              fingerprint: workFingerprint.slice(0, 12),
              cacheHit: false,
              forced: forceRefresh,
              coalesced: true,
              lookupMs: Date.now() - lookupStartedAt,
              persisted: Boolean(databasePath)
            });
          }
        } else {
          logStudyEvent("study_note_cache_miss", {
            objectId,
            promptVersion,
            model,
            fingerprint: workFingerprint.slice(0, 12),
            cacheHit: false,
            forced: forceRefresh,
            coalesced: false,
            lookupMs: Date.now() - lookupStartedAt,
            persisted: Boolean(databasePath)
          });
          entry = createInFlightEntry({
            cacheKey,
            inFlightKey,
            objectId,
            work,
            forceRefresh
          });
          inFlightRequests.set(inFlightKey, entry);
          createdByCurrentRequest = true;
        }

        const result = await entry.promise;

        if (entry.superseded) {
          continue;
        }

        return {
          note: result.note,
          meta: {
            ...result.meta,
            coalesced: !createdByCurrentRequest || result.meta.coalesced
          }
        };
      }
    }
  };
}
