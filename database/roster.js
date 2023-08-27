import { db } from './database.js';

export async function savePostDraftRosters(season) {
    const query = 'INSERT INTO roster (season, team, player, role) SELECT ?, team, id, role FROM player WHERE team IS NOT NULL';
    await db.run(query, season);
}