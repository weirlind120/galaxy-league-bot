import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export let db;

export async function openDb() {
    db = await open({ filename: process.env.dbLocation, driver: sqlite3.Database });
}