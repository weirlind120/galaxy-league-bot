import 'dotenv/config';
import { openDb } from '../database/database.js';
import { loadCurrentSeason } from '../database/season.js';

export let channels;
export let mushiLeagueGuild;
export let currentSeason;

export async function setGlobals(client) {
    channels = client.channels;
    mushiLeagueGuild = await client.guilds.fetch(process.env.guildId);
    await openDb();
    await setCurrentSeason();
}

export async function setCurrentSeason() {
    currentSeason = (await loadCurrentSeason());
}