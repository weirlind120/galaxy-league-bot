import { db } from "./database.js";

export async function loadTeams() {
  return await db.all("SELECT id, discord_snowflake FROM team");
}

export async function loadActiveTeams() {
  return await db.all(
    "SELECT id, discord_snowflake FROM team WHERE active = 1"
  );
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

export async function loadTeamData(snowflake) {
  return await db.all(
    "SELECT player.name, wins, act_wins, losses, act_losses, ties, star_points, pstat.stars FROM pstat INNER JOIN player ON player.id = pstat.player INNER JOIN team ON player.team = team.id WHERE team.discord_snowflake = ? AND season = 15 ORDER BY -pstat.stars;",
    snowflake // KEITH HELP I HARDCODED SEASON = 15
  );
}
