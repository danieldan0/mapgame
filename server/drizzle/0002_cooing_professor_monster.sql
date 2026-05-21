ALTER TABLE "room_players" ALTER COLUMN "game_player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_players" ADD COLUMN "roles" jsonb DEFAULT '["player"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "max_players" integer DEFAULT 6 NOT NULL;
