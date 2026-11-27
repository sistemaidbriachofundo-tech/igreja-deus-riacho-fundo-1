ALTER TABLE "discipleship_tracks" ADD COLUMN "code" TEXT;

WITH candidates AS (
  SELECT id, row_number() OVER (
    PARTITION BY church_id
    ORDER BY (name = 'Trilha da Conexão') DESC,
      (SELECT count(*) FROM discipleship_track_stages s WHERE s.track_id = t.id AND s.code IS NOT NULL) DESC,
      (SELECT count(*) FROM discipleship_enrollments e WHERE e.track_id = t.id) DESC,
      created_at, id
  ) AS priority
  FROM discipleship_tracks t
  WHERE trim(name) ~* '^(trilha[[:space:]]+(da[[:space:]]+)?)?conex[ãa]o$'
)
UPDATE discipleship_tracks t SET code = 'conexao'
FROM candidates c WHERE c.id = t.id AND c.priority = 1;

CREATE UNIQUE INDEX "discipleship_tracks_church_id_code_key" ON "discipleship_tracks" ("church_id", "code");
