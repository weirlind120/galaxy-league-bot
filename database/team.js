import { db } from './database.js';

export async function loadTeams() {
    return await db.all('SELECT id, discord_snowflake FROM team');
}

export async function loadActiveTeams() {
    return await db.all('SELECT id, discord_snowflake FROM team WHERE active = 1');
}

export async function loadTeam(teamId) {
    return await db.get('SELECT id, discord_snowflake FROM team WHERE id = ?', teamId);
}

export async function loadTeamFromSnowflake(snowflake) {
    return await db.get('SELECT id, discord_snowflake FROM team WHERE discord_snowflake = ?', snowflake);
}