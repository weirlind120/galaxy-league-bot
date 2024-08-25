import express from "express";
import {
  loadTeams,
  loadActiveTeams,
  loadTeam,
  loadTeamSheet,
} from "../database/team.js";
import { loadCurrentSeason } from "../database/season.js";
import { openDb } from "../database/database.js";
import 'dotenv/config';
import cors from 'cors';

const app = express();
const port = 3001;

app.use(cors());

app.get("/api/teamlist", async (req, res) => {
  const x = await loadActiveTeams();
  res.set("Access-Control-Allow-Origin", "*");
  res.send(JSON.stringify(x));
});

app.get("/api/teaminfo/:id", async (req, res) => {
  const result = await loadTeamSheet(
    req.params.id,
    (await loadCurrentSeason()).number
  );

  res.set("Access-Control-Allow-Origin", "*");
  res.send(JSON.stringify(result));
});

app.listen(port, async () => {
  await openDb();
});
