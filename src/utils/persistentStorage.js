// persistentStorage.js
// Disk-backed fallback storage used when PostgreSQL is temporarily unavailable.
// Unlike MemoryStorage, data survives normal bot restarts/shutdowns as long as
// the hosting server's filesystem is persistent.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_FILE = path.resolve(__dirname, '../../data/database.json');

class PersistentStorage {
    constructor(filePath = process.env.PERSISTENT_DB_FILE || DEFAULT_FILE) {
        this.filePath = path.resolve(filePath);
        this.data = new Map();
        this.expirationTimes = new Map();
        this.initialized = false;
        this.writeChain = Promise.resolve();
    }

    async initialize() {
        if (this.initialized) return;

        await fs.mkdir(path.dirname(this.filePath), { recursive: true });

        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object') {
                for (const [key, entry] of Object.entries(parsed.data || {})) {
                    this.data.set(key, entry.value);
                    if (entry.expiresAt) this.expirationTimes.set(key, entry.expiresAt);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.warn(`Persistent storage could not be loaded: ${error.message}`);
            }
            await this.persist();
        }

        this.initialized = true;
        logger.warn(`⚠️ Persistent disk storage enabled at ${this.filePath}`);
    }

    async get(key, defaultValue = null) {
        await this.initialize();
        if (this.isExpired(key)) return defaultValue;
        const value = this.data.get(key);
        return value !== undefined ? value : defaultValue;
    }

    async set(key, value, ttl = null) {
        await this.initialize();
        this.data.set(key, value);

        if (ttl && ttl > 0) {
            this.expirationTimes.set(key, Date.now() + (ttl * 1000));
        } else {
            this.expirationTimes.delete(key);
        }

        await this.persist();
        return true;
    }

    async delete(key) {
        await this.initialize();
        this.data.delete(key);
        this.expirationTimes.delete(key);
        await this.persist();
        return true;
    }

    async list(prefix) {
        await this.initialize();
        const keys = [];

        for (const key of this.data.keys()) {
            if (!key.startsWith(prefix)) continue;
            if (this.isExpired(key)) continue;
            keys.push(key);
        }

        return keys;
    }

    async exists(key) {
        await this.initialize();
        if (this.isExpired(key)) return false;
        return this.data.has(key);
    }

    async increment(key, amount = 1) {
        const current = await this.get(key, 0);
        const newValue = Number(current) + amount;
        await this.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        const current = await this.get(key, 0);
        const newValue = Number(current) - amount;
        await this.set(key, newValue);
        return newValue;
    }

    async clear() {
        await this.initialize();
        this.data.clear();
        this.expirationTimes.clear();
        await this.persist();
        return true;
    }

    isExpired(key) {
        const expirationTime = this.expirationTimes.get(key);
        if (!expirationTime) return false;

        if (Date.now() <= expirationTime) return false;

        this.data.delete(key);
        this.expirationTimes.delete(key);
        return true;
    }

    async persist() {
        const snapshot = {};
        for (const [key, value] of this.data.entries()) {
            const expiresAt = this.expirationTimes.get(key) || null;
            if (expiresAt && Date.now() > expiresAt) continue;
            snapshot[key] = { value, expiresAt };
        }

        const payload = JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            data: snapshot,
        }, null, 2);

        // Serialize writes so simultaneous config updates cannot overwrite each other.
        this.writeChain = this.writeChain.then(async () => {
            const tempFile = `${this.filePath}.tmp`;
            await fs.writeFile(tempFile, payload, 'utf8');
            await fs.rename(tempFile, this.filePath);
        });

        return this.writeChain;
    }
}

export { PersistentStorage };