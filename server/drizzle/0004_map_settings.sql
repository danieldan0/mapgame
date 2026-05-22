ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "map_settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
