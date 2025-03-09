import { db } from "./database.js";

export async function loadNextPickTeam() {
  const query =
    "SELECT draft.id AS draftId, round, team.id AS teamId, team.discord_snowflake FROM draft \
         INNER JOIN team ON team.id = draft.team \
         WHERE pick IS NULL \
         ORDER BY season ASC, round ASC, pick_order ASC";

  return await db.get(query);
}

export async function loadNextPickRoundForTeam(teamId) {
  return await db.get(
    "SELECT round FROM draft WHERE pick IS NULL AND team = ?",
    teamId
  );
}

export async function loadDraft(season) {
  const query =
    "SELECT draft.round, draft.pick_order, team.id AS teamId, team.name AS teamName, team.color, player.id AS playerId, player.name AS playerName, pstat.stars FROM draft \
     INNER JOIN player ON player.id = draft.pick \
     INNER JOIN team ON team.id = draft.team \
     INNER JOIN pstat ON pstat.player = draft.pick AND pstat.season = draft.season \
     WHERE draft.season = ? \
     ORDER BY draft.round ASC, draft.pick_order ASC";

  return await db.all(query, season);
}

export async function saveDraftSetup(season, maxRoster, teamOrder) {
  let query = "INSERT INTO draft (season, round, pick_order, team) VALUES";

  for (let round = 1; round <= maxRoster; round++) {
    for (let order = 1; order <= teamOrder.length; order++) {
      const team =
        round % 2 === 1
          ? teamOrder[order - 1]
          : teamOrder[teamOrder.length - order];

      query += `\n(${season}, ${round}, ${order}, ${team})`;

      if (round < maxRoster || order < teamOrder.length) {
        query += ",";
      }
    }
  }

  await db.run(query);
}

export async function saveDraftPick(draftId, playerId) {
  await db.run("UPDATE draft SET pick = ? WHERE id = ?", playerId, draftId);
}

export async function saveWithdrawTeam(teamId) {
  await db.run("DELETE FROM draft WHERE team = ? AND pick IS NULL", teamId);
}
