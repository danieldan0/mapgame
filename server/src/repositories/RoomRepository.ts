import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { players, roomPlayers, rooms } from '../db/schema';
import type { CreateRoomRequest, RoomRole, UpdateRoomSettingsRequest } from '@mapgame/shared';

export type RoomRecord = typeof rooms.$inferSelect;

export class RoomRepository {
  static async create(id: string, settings: CreateRoomRequest): Promise<RoomRecord> {
    const result = await db.insert(rooms).values({
      id,
      name: settings.name,
      isPrivate: settings.isPrivate,
      passwordHash: settings.password ?? null,
      maxPlayers: settings.maxPlayers,
    }).returning();
    return result[0];
  }

  static async updateSettings(id: string, settings: UpdateRoomSettingsRequest): Promise<void> {
    const updates: Partial<typeof rooms.$inferInsert> = {};
    if (settings.name !== undefined) updates.name = settings.name;
    if (settings.isPrivate !== undefined) updates.isPrivate = settings.isPrivate;
    if (settings.password !== undefined) updates.passwordHash = settings.password || null;
    if (settings.maxPlayers !== undefined) updates.maxPlayers = settings.maxPlayers;

    if (Object.keys(updates).length === 0) return;
    await db.update(rooms).set(updates).where(eq(rooms.id, id));
  }

  static async updatePasswordHash(id: string, passwordHash: string | null): Promise<void> {
    await db.update(rooms).set({ passwordHash }).where(eq(rooms.id, id));
  }

  static async getActiveRooms(): Promise<RoomRecord[]> {
    return db
      .select()
      .from(rooms)
      .where(or(eq(rooms.status, 'waiting'), eq(rooms.status, 'playing')));
  }

  static async updateStatus(id: string, status: 'waiting' | 'playing' | 'finished'): Promise<void> {
    const updates: Partial<typeof rooms.$inferInsert> = { status };
    if (status === 'playing') updates.startedAt = new Date();
    if (status === 'finished') updates.finishedAt = new Date();
    await db.update(rooms).set(updates).where(eq(rooms.id, id));
  }

  static async delete(id: string): Promise<void> {
    await db.delete(rooms).where(eq(rooms.id, id));
  }

  static async addPlayer(
    roomId: string,
    playerId: string,
    gamePlayerId: number | null,
    color: number,
    roles: RoomRole[] = ['player'],
    isReady = false
  ): Promise<void> {
    await db
      .insert(roomPlayers)
      .values({ roomId, playerId, gamePlayerId, color, roles, isReady })
      .onConflictDoUpdate({
        target: [roomPlayers.roomId, roomPlayers.playerId],
        set: { color, gamePlayerId, roles, isReady },
      });
  }

  static async removePlayer(roomId: string, playerId: string): Promise<void> {
    await db
      .delete(roomPlayers)
      .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)));
  }

  static async getPlayersInRoom(roomId: string): Promise<Array<{
    persistentId: string;
    gamePlayerId: number | null;
    color: number;
    displayName: string;
    isReady: boolean;
    roles: RoomRole[];
  }>> {
    return db
      .select({
        persistentId: roomPlayers.playerId,
        gamePlayerId: roomPlayers.gamePlayerId,
        color: roomPlayers.color,
        displayName: players.displayName,
        isReady: roomPlayers.isReady,
        roles: roomPlayers.roles,
      })
      .from(roomPlayers)
      .innerJoin(players, eq(players.id, roomPlayers.playerId))
      .where(eq(roomPlayers.roomId, roomId));
  }

  static async findActiveRoomForPlayer(playerId: string): Promise<RoomRecord | null> {
    const result = await db
      .select({ room: rooms })
      .from(rooms)
      .innerJoin(roomPlayers, eq(roomPlayers.roomId, rooms.id))
      .where(
        and(
          eq(roomPlayers.playerId, playerId),
          or(eq(rooms.status, 'waiting'), eq(rooms.status, 'playing'))
        )
      )
      .limit(1);
    return result[0]?.room ?? null;
  }
}
