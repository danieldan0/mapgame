import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, unique } from 'drizzle-orm/pg-core';
import type { MapSettings } from '@mapgame/shared';

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: uuid('token').notNull().unique().defaultRandom(),
  displayName: text('display_name').notNull(),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').$type<'waiting' | 'playing' | 'finished'>().notNull().default('waiting'),
  isPrivate: boolean('is_private').notNull().default(false),
  passwordHash: text('password_hash'),
  maxPlayers: integer('max_players').notNull().default(6),
  mapSettings: jsonb('map_settings').$type<Partial<MapSettings>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
});

export const roomPlayers = pgTable('room_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id),
  gamePlayerId: integer('game_player_id'),
  color: integer('color').notNull(),
  isReady: boolean('is_ready').notNull().default(false),
  roles: jsonb('roles').$type<('host' | 'admin' | 'player' | 'spectator')[]>().notNull().default(['player']),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({
  roomPlayerUnique: unique('room_players_room_player_unique').on(t.roomId, t.playerId),
}));

export const gameSnapshots = pgTable('game_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  turnNumber: integer('turn_number').notNull(),
  state: jsonb('state').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const gameResults = pgTable('game_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  winnerPlayerId: uuid('winner_player_id').references(() => players.id),
  turnCount: integer('turn_count').notNull(),
  endedAt: timestamp('ended_at').defaultNow().notNull(),
  playerResults: jsonb('player_results').$type<{ playerId: string; rank: number; tilesOwned: number }[]>().notNull(),
});
