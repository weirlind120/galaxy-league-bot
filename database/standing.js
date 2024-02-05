import { db } from './database.js';

export async function saveInitialStandings(season) {
    await db.run('INSERT INTO standing (season, team) SELECT ?, id FROM team WHERE active = 1', season);
}

export async function loadStandingWeeksSoFar(season) {
    return await db.get('SELECT wins + losses + ties AS standingsWeeks FROM standing WHERE season = ? LIMIT 1', season);
}

export async function loadStandings(season) {
    const query = 
        'SELECT team.id AS teamId, team.discord_snowflake AS teamSnowflake, team.name AS teamName, \
                standing.wins, standing.losses, standing.ties, standing.battle_differential, standing.points FROM standing \
         INNER JOIN team ON team.id = standing.team \
         WHERE season = ? \
         ORDER BY standing.points DESC, standing.battle_differential DESC';

    return await db.all(query, season);
}

export async function loadTopTeams(season, number) {
    const query =
        'SELECT team.id AS teamId, team.discord_snowflake AS teamSnowflake, team.name AS teamName FROM standing \
         INNER JOIN team ON team.id = standing.team \
         WHERE season = ? \
         ORDER BY standing.points DESC, standing.battle_differential DESC LIMIT ?';

    return await db.all(query, season, number);
}

export async function saveStandingsUpdate(season, differential, leftTeamId, rightTeamId) {
    if (differential > 0) {
        await db.run('UPDATE standing SET wins = wins + 1, points = points + 3, battle_differential = battle_differential + ? WHERE season = ? AND team = ?', differential, season, leftTeamId);
        await db.run('UPDATE standing SET losses = losses + 1, battle_differential = battle_differential - ? WHERE season = ? AND team = ?', differential, season, rightTeamId);
    }
    else if (differential < 0) {
        await db.run('UPDATE standing SET losses = losses + 1, battle_differential = battle_differential + ? WHERE season = ? AND team = ?', differential, season, leftTeamId);
        await db.run('UPDATE standing SET wins = wins + 1, points = points + 3, battle_differential = battle_differential - ? WHERE season = ? AND team = ?', differential, season, rightTeamId);
    }
    else {
        await db.run('UPDATE standing SET ties = ties + 1, points = points + 1 WHERE season = ? AND (team = ? OR team = ?)', season, leftTeamId, rightTeamId);
    }
}