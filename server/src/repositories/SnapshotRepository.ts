import { desc, eq } from 'drizzle-orm';
import type { GameState } from '@mapgame/shared';
import { db } from '../db';
import { gameResults, gameSnapshots } from '../db/schema';

export class SnapshotRepository {
  static async save(roomId: string, turnNumber: number, state: GameState): Promise<void> {
    await db.insert(gameSnapshots).values({ roomId, turnNumber, state: state as object });
  }

  static async getLatest(roomId: string): Promise<{ state: GameState; turnNumber: number } | null> {
    const result = await db
      .select()
      .from(gameSnapshots)
      .where(eq(gameSnapshots.roomId, roomId))
      .orderBy(desc(gameSnapshots.turnNumber))
      .limit(1);
    if (!result[0]) return null;
    return {
      state: result[0].state as unknown as GameState,
      turnNumber: result[0].turnNumber,
    };
  }

  static async saveResult(
    roomId: string,
    turnCount: number,
    winnerPlayerId: string | null,
    playerResults: { playerId: string; rank: number; tilesOwned: number }[]
  ): Promise<void> {
    await db.insert(gameResults).values({
      roomId,
      turnCount,
      winnerPlayerId: winnerPlayerId ?? undefined,
      playerResults,
    });
  }
}
