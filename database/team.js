import { db } from "./database.js";

export async function loadTeams() {
  return await db.all("SELECT id, discord_snowflake FROM team");
}

export async function loadActiveTeams() {
  return await db.all(
    "SELECT id, discord_snowflake, name FROM team WHERE active = 1"
  );
}

export async function loadTeamSheet(teamId, season) {
  const teamInfo = await db.get(
    "SELECT team.name, team.id, team.color, wins, losses, ties, points, battle_differential FROM standing INNER JOIN team ON team = team.id WHERE standing.team = ? AND season = ?;",
    teamId,
    season
  );
  const playerQuery =
    "SELECT player.name, player.id, pstat.wins, pstat.act_wins, pstat.losses, pstat.act_losses, pstat.ties, pstat.star_points, pstat.stars, role.name AS role FROM roster \
     INNER JOIN player ON player.id = roster.player \
     LEFT JOIN pstat ON pstat.player = roster.player AND pstat.season = roster.season \
     INNER JOIN role ON role.id = roster.role \
     WHERE roster.season = ? AND roster.team = ? \
     ORDER BY pstat.stars DESC";
  teamInfo.players = await db.all(playerQuery, season, teamId);
  return teamInfo;
}

export async function loadTeam(teamId) {
  return await db.get(
    "SELECT id, discord_snowflake FROM team WHERE id = ?",
    teamId
  );
}

export async function loadTeamFromSnowflake(snowflake) {
  return await db.get(
    "SELECT id, discord_snowflake FROM team WHERE discord_snowflake = ?",
    snowflake
  );
}

export async function loadTeamData(snowflake, season) {
  const query = `SELECT player.name, wins, act_wins, losses, act_losses, ties, star_points, pstat.stars FROM pstat \
     INNER JOIN player ON player.id = pstat.player \
     INNER JOIN team ON player.team = team.id \
     WHERE team.discord_snowflake = ? AND season = ? \
     ORDER BY pstat.stars DESC`;
  return await db.all(query, snowflake, season);
}
