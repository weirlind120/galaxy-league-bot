import { db } from './database.js';

export async function saveScheduleMessageId(messageId, matchupId) {
    await db.run('UPDATE matchup SET schedule_message = ? WHERE id = ?', messageId, matchupId);
}

export async function saveMatchRoomMessageId(messageId, matchupId) {
    await db.run('UPDATE matchup SET channel_message = ? WHERE id = ?', messageId, matchupId);
}

export async function saveOneNewMatchup(room, leftTeamId, rightTeamId, season, week) {
    await db.run('INSERT INTO matchup (room, week, left_team, right_team) SELECT ?, id, ?, ? FROM week WHERE season = ? AND number = ?', room, leftTeamId, rightTeamId, season, week);
}

export async function saveMatchupSubmission(matchupId, riggedCount, slots, side, submitterId) {
    await db.run(`UPDATE matchup SET rigged_count = ?, slots = ?, ${side}_submitter = ? WHERE id = ?`, riggedCount, slots, submitterId, matchupId);
}

export async function loadAllMatchups(season, week) {
    const query =
        'SELECT leftTeam.id AS leftId, leftTeam.discord_snowflake AS leftSnowflake, \
                rightTeam.id AS rightId, rightTeam.discord_snowflake AS rightSnowflake, \
                room FROM matchup \
         INNER JOIN team AS leftTeam ON leftTeam.id = matchup.left_team \
         INNER JOIN team AS rightTeam ON rightTeam.id = matchup.right_team \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.season = ? AND week.number = ? \
         ORDER BY room';
    return await db.all(query, season, week);
}

export async function loadMatchupsMissingLineups(season, week) {
    const query =
        'SELECT team.id AS teamId, team.discord_snowflake AS delinquentTeamSnowflake, matchup.left_team, matchup.right_team, matchup.slots AS matchupSlots, matchup.rigged_count FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.left_team \
         INNER JOIN week ON week.id = matchup.week \
         WHERE pairing.left_player IS NULL AND week.season = ? AND week.number = ? \
         UNION \
         SELECT team.id AS teamId, team.discord_snowflake AS delinquentTeamSnowflake, matchup.left_team, matchup.right_team, matchup.slots AS matchupSlots, matchup.rigged_count FROM matchup \
         LEFT JOIN pairing ON pairing.matchup = matchup.id \
         INNER JOIN team ON team.id = matchup.right_team \
         INNER JOIN week on week.id = matchup.week \
         WHERE pairing.right_player IS NULL AND week.season = ? AND week.number = ?';

    return await db.all(query, season, week, season, week);
}

export async function loadMatchupForTeam(season, week, teamSnowflake) {
    const query =
        'SELECT matchup.id, matchup.slots, matchup.rigged_count, matchup.left_team, matchup.right_team, matchup.room, matchup.channel_message, matchup.schedule_message, \
                team.id AS submittingTeamId, team.discord_snowflake AS teamSnowflake FROM matchup \
         INNER JOIN week ON matchup.week = week.id \
         INNER JOIN team ON (matchup.left_team = team.id OR matchup.right_team = team.id) \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ? \
         UNION \
         SELECT matchup.id, matchup.slots, matchup.rigged_count, matchup.left_team, matchup.right_team, matchup.room, matchup.channel_message, matchup.schedule_message, \
                team.id AS submittingTeamId, team.discord_snowflake AS teamSnowflake FROM matchup \
         INNER JOIN week on matchup.week = week.id \
         INNER JOIN team on matchup.right_team = team.id \
         WHERE week.season = ? AND week.number = ? AND team.discord_snowflake = ?';

    return await db.get(query, season, week, teamSnowflake, season, week, teamSnowflake);
}

export async function loadOldPairingMessage(room) {
    return await db.get('SELECT channel_message FROM matchup WHERE room = ? AND channel_message IS NOT NULL ORDER BY week DESC LIMIT 1', room);
}