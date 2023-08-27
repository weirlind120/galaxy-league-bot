import { db } from './database.js';

export async function saveNewWeeks(length, season) {
    const weekQuery = 'INSERT INTO week (number, season) VALUES'.concat(
        Array(length).map((_, i) => `\n(${i + 1}, ${season})`).join('')
    );

    await db.run(weekQuery);
}