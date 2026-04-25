-- Adds the Unshelv'd catalog ID system: a stable, human-readable identifier
-- for every work and every edition. Format:
--   work    -> UN<8-digit-zero-padded>W           e.g. UN00000042W
--   edition -> UN<8-digit-zero-padded>W-E<3>      e.g. UN00000042W-E001
-- The edition ID literally embeds its parent work ID so the relationship
-- is visible without a join. IDs are assigned by the seed generator in a
-- deterministic order so they are stable across regenerations.

ALTER TABLE "works"        ADD COLUMN IF NOT EXISTS "unshelvd_id" text;
ALTER TABLE "book_catalog" ADD COLUMN IF NOT EXISTS "unshelvd_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "works_unshelvd_id_uniq"
  ON "works"("unshelvd_id");
CREATE UNIQUE INDEX IF NOT EXISTS "book_catalog_unshelvd_id_uniq"
  ON "book_catalog"("unshelvd_id");
