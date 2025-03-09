import { db } from "./database.js";
import { fixFloat } from "../bot/commands/util.js";

export async function loadPlayerStats(season) {
  const query =
    "SELECT player.id, player.name, (pstat.wins + pstat.act_wins - pstat.losses - pstat.act_losses) AS differential, \
     pstat.wins, pstat.act_wins, pstat.losses, pstat.act_losses, pstat.ties, pstat.star_points, pstat.stars \
     FROM pstat \
     INNER JOIN player ON player.id = pstat.player \
     WHERE pstat.season = ? \
     ORDER BY differential DESC, pstat.star_points DESC, pstat.stars DESC";
  return await db.all(query, season);
}

export async function savePlayerStatUpdate(season, pairing) {
  if (pairing.dead) {
    await db.run(
      "UPDATE pstat SET ties = ties + 1 WHERE season = ? AND (player = ? OR player = ?)",
      season,
      pairing.winningId,
      pairing.losingId
    );
  } else if (!pairing.game1) {
    await db.run(
      "UPDATE pstat SET act_wins = act_wins + 1 WHERE season = ? AND player = ?",
      season,
      pairing.winningId
    );
    await db.run(
      "UPDATE pstat SET act_losses = act_losses + 1 WHERE season = ? AND player = ?",
      season,
      pairing.losingId
    );
  } else {
    const spread = getSpread(pairing.winningStars, pairing.losingStars);
    await db.run(
      "UPDATE pstat SET wins = wins + 1, star_points = star_points + ? WHERE season = ? AND player = ?",
      spread,
      season,
      pairing.winningId
    );
    await db.run(
      "UPDATE pstat SET losses = losses + 1, star_points = star_points - ? WHERE season = ? AND player = ?",
      spread,
      season,
      pairing.losingId
    );
  }
}

function getSpread(winningStars, losingStars) {
  const x = fixFloat(winningStars - losingStars);

  if (x > 1) return 5;
  if (x < -1) return 15;
  return 10;
}
