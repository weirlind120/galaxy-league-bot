import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export function openDb() {
    return await open({ filename: process.env.dbLocation, driver: sqlite3.Database });
}