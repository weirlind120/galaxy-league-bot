import { db } from './database.js';
import { fixFloat } from '../bot/commands/util.js';

export async function saveInitialPstats(season) {
    const query = 'INSERT INTO pstat (player, season, stars) SELECT id, ?, stars FROM player WHERE team IS NOT NULL AND role != 3';
    await db.run(query, season);
}

export async function savePlayerStatUpdate(season, pairing) {
    if (pairing.dead) {
        await db.run('UPDATE pstat SET ties = ties + 1 WHERE season = ? AND (player = ? OR player = ?)', season, pairing.winningId, pairing.losingId);
    }
    else if (!pairing.game1) {
        await db.run('UPDATE pstat SET act_wins = act_wins + 1 WHERE season = ? AND player = ?', season, pairing.winningId);
        await db.run('UPDATE pstat SET act_losses = act_losses + 1 WHERE season = ? AND player = ?', season, pairing.losingId);
    }
    else {
        const spread = getSpread(pairing.winningStars, pairing.losingStars);
        await db.run('UPDATE pstat SET wins = wins + 1, star_points = star_points + ? WHERE season = ? AND player = ?', spread, season, pairing.winningId);
        await db.run('UPDATE pstat SET losses = losses + 1, star_points = star_points - ? WHERE season = ? AND player = ?', spread, season, pairing.losingId);
    }
}

function getSpread(winningStars, losingStars) {
    const x = fixFloat(winningStars - losingStars);

    if (x > 1) return 5;
    if (x < -1) return 15;
    return 10;
}