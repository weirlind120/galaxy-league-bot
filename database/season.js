import { db } from './database.js';

export async function loadCurrentSeason() {
    return await db.get('SELECT * FROM season ORDER BY number DESC LIMIT 1');
}

export async function loadAllSeasons() {
    return await db.all('SELECT number FROM season ORDER BY number DESC');
}

export async function saveNewSeason(season, length, playoffSize) {
    await db.run('INSERT INTO season (number, current_week, regular_weeks, playoff_size) VALUES (?, 0, ?, ?)', season, length, playoffSize);
}

export async function saveAdvanceWeek(season, week) {
    await db.run('UPDATE season SET current_week = ? WHERE number = ?', week, season);
}