import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export let channels;
export let mushiLeagueGuild;
export let db;
export let currentSeason;

export async function setGlobals(client) {
    channels = client.channels;
    mushiLeagueGuild = await client.guilds.fetch(process.env.guildId);
    db = await open({ filename: process.env.dbLocation, driver: sqlite3.Database });
    currentSeason = (await db.get('SELECT * FROM season ORDER BY number DESC LIMIT 1'));
}