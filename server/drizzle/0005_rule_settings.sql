ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "rule_settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
