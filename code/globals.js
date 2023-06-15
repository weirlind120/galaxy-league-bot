import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export let db;
export let currentSeason;
export let captainChannel;
export let matchReportChannel;

export async function setGlobals(client) {
    db = await open({ filename: '../database/mushi_league.db', driver: sqlite3.Database });
    currentSeason = (await db.get('SELECT * FROM season ORDER BY number DESC'));
    captainChannel = await client.channels.fetch(process.env.captainChannelId);
    matchReportChannel = await client.channels.fetch(process.env.matchReportChannelId);
}