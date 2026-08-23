import 'dotenv/config';
import express from 'express';

import { pgDb } from './utils/database.js';
import { registerVortexApi } from './services/vortexApi.js';
import { logger, startupLog } from './utils/logger.js';

const app = express();
const port = Number(process.env.VORTEX_API_PORT || 3001);
const host = process.env.VORTEX_API_HOST || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

async function ensureVortexTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vortex_likes (
      target_id BIGINT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (target_id, actor_id)
    );

    CREATE TABLE IF NOT EXISTS vortex_ratings (
      target_id BIGINT NOT NULL,
      actor_id TEXT NOT NULL,
      vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (target_id, actor_id)
    );

    CREATE TABLE IF NOT EXISTS vortex_comments (
      id BIGSERIAL PRIMARY KEY,
      game_id BIGINT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vortex_threads (
      id BIGSERIAL PRIMARY KEY,
      category_id TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vortex_posts (
      id BIGSERIAL PRIMARY KEY,
      thread_id BIGINT NOT NULL REFERENCES vortex_threads(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vortex_dm_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS vortex_likes_target_idx ON vortex_likes(target_id);
    CREATE INDEX IF NOT EXISTS vortex_ratings_target_idx ON vortex_ratings(target_id);
    CREATE INDEX IF NOT EXISTS vortex_comments_game_idx ON vortex_comments(game_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS vortex_threads_category_idx ON vortex_threads(category_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS vortex_posts_thread_idx ON vortex_posts(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS vortex_dm_recipient_idx ON vortex_dm_messages(recipient_id, read_at);
    CREATE INDEX IF NOT EXISTS vortex_dm_pair_idx ON vortex_dm_messages(sender_id, recipient_id, created_at);
  `);
}

async function start() {
  try {
    const connected = await pgDb.connect();
    if (!connected || !pgDb.isAvailable()) {
      logger.warn('Vortex API database is unavailable; API will not start.');
      return;
    }

    await ensureVortexTables(pgDb.pool);
    registerVortexApi(app, pgDb.pool);

    app.get('/', (_req, res) => res.json({
      ok: true,
      name: 'Vortex07 API',
      backend: 'Blue',
      version: '1.0.0',
      features: ['comments', 'likes', 'ratings', 'forum', 'dms']
    }));

    app.listen(port, host, () => {
      startupLog(`Vortex API running on ${host}:${port}`);
      startupLog(`Vortex API health: http://${host}:${port}/v1/health`);
    });
  } catch (error) {
    logger.error('Failed to start Vortex API:', error);
  }
}

start();
