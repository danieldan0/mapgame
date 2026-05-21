import { eq } from 'drizzle-orm';
import { db } from '../db';
import { players } from '../db/schema';

export type PlayerRecord = typeof players.$inferSelect;

export class PlayerRepository {
  static async findByToken(token: string): Promise<PlayerRecord | null> {
    const result = await db.select().from(players).where(eq(players.token, token)).limit(1);
    return result[0] ?? null;
  }

  static async create(displayName: string): Promise<PlayerRecord> {
    const result = await db.insert(players).values({ displayName }).returning();
    return result[0];
  }

  static async updateLastSeen(id: string): Promise<void> {
    await db.update(players).set({ lastSeenAt: new Date() }).where(eq(players.id, id));
  }

  static async updateName(id: string, displayName: string): Promise<void> {
    await db.update(players).set({ displayName }).where(eq(players.id, id));
  }
}
