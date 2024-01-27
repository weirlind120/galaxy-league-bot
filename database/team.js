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
    "SELECT team.name, wins, losses, ties FROM standing JOIN team ON team = team.id WHERE standing.team = ? AND season = ?;",
    teamId,
    season
  );
  const snowflake = (
    await db.get("SELECT discord_snowflake FROM team WHERE team.id = ?", teamId)
  ).discord_snowflake;
  teamInfo.players = await loadTeamData(snowflake, season);
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
