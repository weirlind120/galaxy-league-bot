import { db } from "./database.js";

export async function loadAllPairings(season, week) {
  const query =
    "SELECT leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftPlayer.name AS leftPlayerName, leftTeam.name AS leftTeamName, leftTeam.discord_snowflake AS leftTeamSnowflake, leftTeam.emoji AS leftEmoji, \
                rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightPlayer.name AS rightPlayerName, rightTeam.name AS rightTeamName, rightTeam.discord_snowflake AS rightTeamSnowflake, rightTeam.emoji AS rightEmoji, \
                pairing.id, pairing.matchup, pairing.slot, matchup.room FROM pairing \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         INNER JOIN team AS leftTeam ON matchup.left_team = leftTeam.id \
         INNER JOIN team AS rightTeam ON matchup.right_team = rightTeam.id \
         INNER JOIN player AS leftPlayer ON pairing.left_player = leftPlayer.id \
         INNER JOIN player AS rightPlayer ON pairing.right_player = rightPlayer.id \
         WHERE week.season = ? AND week.number = ? \
         ORDER BY room ASC, slot ASC";

  return await db.all(query, season, week);
}

export async function loadOpenPairings(season, week) {
  const query =
    "SELECT leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftPlayer.name AS leftPlayerName, leftTeam.name AS leftTeamName, leftTeam.discord_snowflake AS leftTeamSnowflake, \
                rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightPlayer.name AS rightPlayerName, rightTeam.name AS rightTeamName, rightTeam.discord_snowflake AS rightTeamSnowflake, pairing.matchup, matchup.room FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE pairing.winner IS NULL AND pairing.dead IS NULL AND week.season = ? AND week.number = ?";
  return await db.all(query, season, week);
}

export async function loadPairingsForMatchup(matchupId) {
  return await db.all(
    "SELECT id FROM pairing WHERE matchup = ? ORDER BY slot ASC",
    matchupId
  );
}

export async function loadOnePairing(season, week, playerSnowflake) {
  const query =
    "SELECT pairing.id, pairing.winner, pairing.dead, pairing.slot, pairing.predictions_message, \
                matchup.predictions_message AS matchupPrediction, matchup.schedule_message, matchup.room, (predictedPairings.pairing IS NOT NULL) AS predictionsSaved, \
                leftPlayer.id AS leftPlayerId, leftPlayer.discord_snowflake AS leftPlayerSnowflake, leftPlayer.name AS leftPlayerName, leftTeam.discord_snowflake AS leftTeamSnowflake, leftTeam.emoji AS leftEmoji, \
                rightPlayer.id AS rightPlayerId, rightPlayer.discord_snowflake AS rightPlayerSnowflake, rightPlayer.name AS rightPlayerName, rightTeam.discord_snowflake AS rightTeamSnowflake, rightTeam.emoji AS rightEmoji FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         LEFT JOIN (SELECT DISTINCT pairing FROM prediction) AS predictedPairings ON pairing.id = predictedPairings.pairing \
         WHERE (rightPlayer.discord_snowflake = ? OR leftPlayer.discord_snowflake = ?) \
             AND week.number = ? AND week.season = ?";

  return await db.get(query, playerSnowflake, playerSnowflake, week, season);
}

export async function loadAllPairingResults(season, week) {
  const query =
    "SELECT winningPlayer.id AS winningId, winningPlayer.stars AS winningStars, winningPlayer.team AS winningTeam, \
                losingPlayer.id AS losingId, losingPlayer.stars AS losingStars, losingPlayer.team AS losingTeam, \
                pairing.game1, pairing.dead FROM pairing \
         INNER JOIN player AS winningPlayer ON winningPlayer.id = IIF(pairing.winner = pairing.left_player, pairing.left_player, pairing.right_player) \
         INNER JOIN player AS losingPlayer ON losingPlayer.id = IIF(pairing.winner = pairing.left_player, pairing.right_player, pairing.left_player) \
         INNER JOIN matchup ON matchup.id = pairing.matchup \
         INNER JOIN week ON week.id = matchup.week \
         WHERE week.season = ? AND week.number = ?";

  return await db.all(query, season, week);
}

export async function loadReplays(startSeason, endSeason, playerSnowflake) {
  const query =
    "SELECT pairing.game1, pairing.game2, pairing.game3, pairing.game4, pairing.game5 FROM pairing \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         WHERE week.season >= ? AND week.season <= ? AND pairing.game1 IS NOT NULL \
             AND (pairing.left_player = (SELECT id FROM player WHERE discord_snowflake = ?) OR \
                 pairing.right_player = (SELECT id FROM player WHERE discord_snowflake = ?)) \
         ORDER BY week.season DESC, week.number DESC";

  return await db.all(
    query,
    startSeason,
    endSeason,
    playerSnowflake,
    playerSnowflake
  );
}

export async function loadOneLineup(season, week, requesterSnowflake) {
  const query =
    "SELECT slot, player.discord_snowflake AS playerSnowflake, matchup.rigged_count, team.discord_snowflake AS teamSnowflake FROM pairing \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         INNER JOIN player ON pairing.left_player = player.id \
         INNER JOIN team ON matchup.left_team = team.id \
         WHERE matchup.left_team = (SELECT team FROM player WHERE discord_snowflake = ?) AND week.season = ? AND week.number = ? \
         UNION \
         SELECT slot, player.discord_snowflake AS playerSnowflake, matchup.rigged_count, team.discord_snowflake AS teamSnowflake FROM pairing \
         INNER JOIN matchup ON pairing.matchup = matchup.id \
         INNER JOIN week ON matchup.week = week.id \
         INNER JOIN player ON pairing.right_player = player.id \
         INNER JOIN team ON matchup.right_team = team.id \
         WHERE matchup.right_team = (SELECT team FROM player WHERE discord_snowflake = ?) AND week.season = ? AND week.number = ? \
         ORDER BY slot ASC";

  return await db.all(
    query,
    requesterSnowflake,
    season,
    week,
    requesterSnowflake,
    season,
    week
  );
}

export async function loadNextMatches() {
  const query =
    "SELECT leftPlayer.name AS leftPlayerName, leftTeam.discord_snowflake AS leftTeamSnowflake, rightPlayer.name AS rightPlayerName, rightTeam.discord_snowflake AS rightTeamSnowflake, scheduled_datetime FROM pairing \
         INNER JOIN player AS leftPlayer ON leftPlayer.id = pairing.left_player \
         INNER JOIN team AS leftTeam ON leftTeam.id = leftPlayer.team \
         INNER JOIN player AS rightPlayer ON rightPlayer.id = pairing.right_player \
         INNER JOIN team AS rightTeam ON rightTeam.id = rightPlayer.team \
         WHERE scheduled_datetime > ? \
         ORDER BY scheduled_datetime ASC LIMIT 10";

  return await db.all(query, Date.now());
}

export async function loadSchedule(season) {
  const query =
    "SELECT leftPlayer.id AS leftPlayerId, leftPlayer.name AS leftPlayerName, leftTeam.id AS leftTeamId, leftTeam.name AS leftTeamName, leftTeam.color AS leftTeamColor, \
      rightPlayer.id AS rightPlayerId, rightPlayer.name AS rightPlayerName, rightTeam.id AS rightTeamId, rightTeam.name AS rightTeamName, rightTeam.color AS rightTeamColor, \
      pairing.winner, pairing.dead, pairing.game1, pairing.game2, pairing.game3, pairing.game4, pairing.game5, \
      week.number AS weekNumber, matchup.id AS matchupId, season.regular_weeks, season.playoff_size FROM season \
    LEFT JOIN week ON week.season = season.number \
    LEFT JOIN matchup ON matchup.week = week.id \
    LEFT JOIN pairing ON pairing.matchup = matchup.id \
    INNER JOIN team AS leftTeam ON matchup.left_team = leftTeam.id \
    INNER JOIN team AS rightTeam ON matchup.right_team = rightTeam.id \
    INNER JOIN player AS leftPlayer ON pairing.left_player = leftPlayer.id \
    INNER JOIN player AS rightPlayer ON pairing.right_player = rightPlayer.id \
    WHERE season.number = ? \
    ORDER BY week.number ASC, matchup.room ASC, pairing.slot ASC";

  return await db.all(query, season);
}

export async function savePairingResult(pairingId, games, winner, dead) {
  await db.run(
    "UPDATE pairing SET game1 = ?, game2 = ?, game3 = ?, game4 = ?, game5 = ?, winner = ?, dead = ? WHERE id = ?",
    games?.at(0),
    games?.at(1),
    games?.at(2),
    games?.at(3),
    games?.at(4),
    winner,
    dead,
    pairingId
  );
}

export async function savePredictionsMessageId(table, messageId, primaryKey) {
  await db.run(
    `UPDATE ${table} SET predictions_message = ? WHERE id = ?`,
    messageId,
    primaryKey
  );
}

export async function saveDeletePairingsForMatchup(matchupId) {
  await db.run("DELETE FROM pairing WHERE matchup = ?", matchupId);
}

export async function saveSubstitution(matchupId, slot, side, newPlayerId) {
  await db.run(
    `UPDATE pairing SET ${side}_player = ? WHERE matchup = ? AND slot = ?`,
    newPlayerId,
    matchupId,
    slot
  );
}

export async function saveLineupSubmission(matchupId, side, lineup) {
  const pairings = await loadPairingsForMatchup(matchupId);

  if (pairings.length > 0) {
    for (const index in pairings) {
      await db.run(
        `UPDATE pairing SET ${side}_player = ? WHERE id = ?`,
        lineup[index].id,
        pairings[index].id
      );
    }
  } else {
    const query =
      `INSERT INTO pairing (matchup, slot, ${side}_player) VALUES`.concat(
        lineup.map(
          (player, index) => `\n(${matchupId}, ${index + 1}, ${player.id})`
        )
      );

    await db.run(query);
  }
}

export async function saveScheduledTime(pairingId, date) {
  await db.run(
    "UPDATE pairing SET scheduled_datetime = ? WHERE id = ?",
    date.valueOf(),
    pairingId
  );
}
