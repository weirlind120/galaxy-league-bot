import { db } from './database.js';

export async function loadRoleFromSnowflake(snowflake) {
	return await db.get('SELECT id, discord_snowflake FROM role WHERE discord_snowflake = ?', snowflake);
}