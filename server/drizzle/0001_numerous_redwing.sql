ALTER TABLE "players" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_username_unique" UNIQUE("username");