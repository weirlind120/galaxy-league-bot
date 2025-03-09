import { db } from "./database.js";

export async function savePostDraftRosters(season) {
  const query =
    "INSERT INTO roster (season, team, player, role) SELECT ?, team, id, role FROM player WHERE team IS NOT NULL";
  await db.run(query, season);
}

export async function loadAllTeams(season) {
  const query =
    "SELECT DISTINCT team.id, team.name, team.color FROM roster \
     INNER JOIN team ON team.id = roster.team \
     WHERE roster.season = ? \
     ORDER BY team.name ASC";

  return await db.all(query, season);
}
