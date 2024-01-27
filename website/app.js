import express from "express";
import {
  loadTeams,
  loadActiveTeams,
  loadTeam,
  loadTeamSheet,
} from "../database/team.js";
import { loadCurrentSeason } from "../database/season.js";
import { openDb } from "../database/database.js";

const app = express();
const port = 3030;

app.get("/teamlist", async (req, res) => {
  const x = await loadActiveTeams();
  res.set("Access-Control-Allow-Origin", "*");
  res.send(JSON.stringify(x));
});

app.get("/teaminfo/:id", async (req, res) => {
  console.log("hullo");
  console.log((await loadCurrentSeason()).number);
  const result = await loadTeamSheet(
    req.params.id,
    (await loadCurrentSeason()).number
  );
  console.log(result);

  res.set("Access-Control-Allow-Origin", "*");
  res.send(JSON.stringify(result));
});

app.listen(port, async () => {
  console.log(`Example app listening on port ${port}!`);
  await openDb();
});
