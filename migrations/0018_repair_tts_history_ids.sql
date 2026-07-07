UPDATE tts_history
SET id = 'legacy:' || rowid
WHERE (id IS NULL OR id = '')
  AND NOT EXISTS (
    SELECT 1 FROM tts_history existing WHERE existing.id = 'legacy:' || tts_history.rowid
  );
