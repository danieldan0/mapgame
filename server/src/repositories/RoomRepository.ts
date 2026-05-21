import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { players, roomPlayers, rooms } from '../db/schema';

export type RoomRecord = typeof rooms.$inferSelect;

export class RoomRepository {
  static async create(id: string, name: string): Promise<RoomRecord> {
    const result = await db.insert(rooms).values({ id, name }).returning();
    return result[0];
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

  static async addPlayer(roomId: string, playerId: string, gamePlayerId: number, color: number): Promise<void> {
    await db
      .insert(roomPlayers)
      .values({ roomId, playerId, gamePlayerId, color })
      .onConflictDoUpdate({
        target: [roomPlayers.roomId, roomPlayers.playerId],
        set: { color, gamePlayerId },
      });
  }

  static async removePlayer(roomId: string, playerId: string): Promise<void> {
    await db
      .delete(roomPlayers)
      .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)));
  }

  static async getPlayersInRoom(roomId: string): Promise<Array<{
    persistentId: string;
    gamePlayerId: number;
    color: number;
    displayName: string;
  }>> {
    return db
      .select({
        persistentId: roomPlayers.playerId,
        gamePlayerId: roomPlayers.gamePlayerId,
        color: roomPlayers.color,
        displayName: players.displayName,
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
