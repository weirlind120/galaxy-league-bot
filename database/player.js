import { db } from './database.js';

export async function saveDropAllPlayers() {
    await db.run('UPDATE player SET active = false, retain_rights = team, team = NULL, role = NULL');
}

export async function saveStarPointsToRatings(season) {
    await db.run('UPDATE player SET stars = MAX(MIN(player.stars + (pstat.star_points / 100.0), 5), 1) \
                  FROM pstat WHERE pstat.player = player.id AND pstat.season = ?', season);
}

export async function saveNewPlayer(snowflake, name, stars) {
    await db.run(`INSERT INTO player (name, discord_snowflake, stars) VALUES (?, ?, ?)`, name, snowflake, stars);
}

export async function savePlayerChange(snowflake, name, stars, team, role, active) {
    await db.run(`UPDATE player SET name = ?, stars = ?, team = ?, role = ?, active = ? WHERE discord_snowflake = ?`, name, stars, team, role, active, snowflake);
}

export async function loadAllActivePlayers() {
    return await db.all('SELECT discord_snowflake FROM player WHERE active = 1');
}

export async function loadAllPlayersOnTeam(teamId) {
    return await db.all('SELECT discord_snowflake FROM player WHERE player.team = ?', teamId);
}

export async function loadPlayerFromSnowflake(playerSnowflake) {
    const query =
        'SELECT player.id, player.name, player.stars, player.active, player.discord_snowflake, \
                role.id AS roleId, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM player \
         LEFT JOIN team ON team.id = player.team \
         LEFT JOIN role ON role.id = player.role \
         WHERE player.discord_snowflake = ?';

    return await db.get(query, playerSnowflake);
}

export async function loadPlayerFromUsername(playerName) {
    const query = 
        'SELECT player.id, player.name, player.stars, player.active, player.discord_snowflake, \
                role.id AS roleId, role.discord_snowflake AS roleSnowflake, role.name AS roleName, team.id AS teamId, team.discord_snowflake AS teamSnowflake FROM player \
         LEFT JOIN team ON team.id = player.team \
         LEFT JOIN role ON role.id = player.role \
         WHERE player.name = ?';

    return await db.get(query, playerName);
}

export async function loadExistingLeader(teamSnowflake, roleSnowflake) {
    const query =
        'SELECT player.discord_snowflake FROM player \
         INNER JOIN team ON team.id = player.team \
         INNER JOIN role ON role.id = player.role \
         WHERE team.discord_snowflake = ? AND role.discord_snowflake = ?';

    return await db.get(query, teamSnowflake, roleSnowflake);
}

export async function loadTeamInStarOrder(teamSnowflake) {
    const query =
        'SELECT player.id, player.discord_snowflake, player.stars, team.discord_snowflake AS teamSnowflake, role.name AS roleName FROM player \
         INNER JOIN team ON player.team = team.id \
         INNER JOIN role ON player.role = role.id \
         WHERE team.discord_snowflake = ? \
         ORDER BY stars DESC';
    return await db.all(query, teamSnowflake);
}

export async function loadPlayersOnTeamInStarOrder(teamId) {
    return await db.all('SELECT id FROM player WHERE team = ? AND role != 3 ORDER BY stars DESC', teamId);
}

export async function loadRosterSize(teamId, captainOnly) {
    if (captainOnly) {
        return await db.get('SELECT COUNT(stars) AS size, SUM(stars) AS stars FROM player WHERE team = ? AND role = 2', teamId);
    }

    else return await db.get('SELECT COUNT(stars) AS size, SUM(stars) AS stars FROM player WHERE team = ? AND role != 3', teamId);
}

export async function loadUndraftedPlayers(maxStars) {
    return await db.all('SELECT name, stars, discord_snowflake FROM player WHERE team IS NULL AND active = 1 AND stars <= ? ORDER BY stars DESC', maxStars);
}

export async function loadPlayersForSubstitution(season, week, replacedPlayerSnowflake, newPlayerSnowflake) {
    const query =
        'SELECT player.id, player.stars, player.name, player.discord_snowflake, team.discord_snowflake AS teamSnowflake, role.name AS roleName, \
                pairing.slot, IIF(pairing.left_player = player.id, "left", "right") AS side, pairing.winner, pairing.dead, pairing.predictions_message FROM player \
         LEFT JOIN( \
             SELECT * FROM pairing \
	         INNER JOIN matchup ON matchup.id = pairing.matchup \
	         INNER JOIN week ON week.id = matchup.week \
	         WHERE week.season = ? AND week.number = ? \
         ) AS pairing ON pairing.left_player = player.id OR pairing.right_player = player.id \
         INNER JOIN team ON team.id = player.team \
         INNER JOIN role ON role.id = player.role \
         WHERE player.discord_snowflake = ? OR player.discord_snowflake = ?';

    return await db.all(query, season, week, replacedPlayerSnowflake, newPlayerSnowflake);
}