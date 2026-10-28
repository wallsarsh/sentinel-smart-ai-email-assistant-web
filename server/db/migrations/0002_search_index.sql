-- Full-text index over the fields search covers. The query in server/repos/search.ts
-- uses the exact same expression so Postgres can use this index.
CREATE INDEX "messages_fts" ON "messages" USING gin (
  to_tsvector('simple', coalesce("subject", '') || ' ' || coalesce("from_address", '') || ' ' || coalesce("from_name", '') || ' ' || coalesce("body_text", ''))
);
