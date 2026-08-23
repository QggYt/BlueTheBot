export function registerVortexApi(app, db) {
  const query = (text, params) => db.query(text, params);
  const actor = req => req.body?.actorId ?? req.query.actorId ?? req.get('x-vortex-actor-id');
  const id = value => /^\d+$/.test(String(value ?? ''));
  const text = (value, max) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

  app.use('/v1', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vortex-Actor-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/v1/health', async (_req, res) => {
    try { await query('SELECT 1'); res.json({ ok: true, database: true }); }
    catch { res.status(503).json({ ok: false, database: false }); }
  });

  app.get('/v1/likes/:targetId', async (req, res) => {
    const target = Number(req.params.targetId), actorId = actor(req);
    if (!Number.isSafeInteger(target)) return res.status(400).json({ ok: false, error: 'bad-target' });
    try {
      const count = await query('SELECT COUNT(*)::int count FROM vortex_likes WHERE target_id=$1', [target]);
      const mine = id(actorId) ? await query('SELECT 1 FROM vortex_likes WHERE target_id=$1 AND actor_id=$2', [target, actorId]) : { rowCount: 0 };
      res.json({ ok: true, count: count.rows[0].count, liked: mine.rowCount > 0 });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/likes/:targetId', async (req, res) => {
    const target = Number(req.params.targetId), actorId = actor(req);
    if (!Number.isSafeInteger(target) || !id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    const liked = typeof req.body?.liked === 'boolean' ? req.body.liked : true;
    try {
      if (liked) await query('INSERT INTO vortex_likes(target_id,actor_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [target, actorId]);
      else await query('DELETE FROM vortex_likes WHERE target_id=$1 AND actor_id=$2', [target, actorId]);
      const count = await query('SELECT COUNT(*)::int count FROM vortex_likes WHERE target_id=$1', [target]);
      res.json({ ok: true, liked, count: count.rows[0].count });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/ratings/:targetId', async (req, res) => {
    const target = Number(req.params.targetId), actorId = actor(req);
    if (!Number.isSafeInteger(target)) return res.status(400).json({ ok: false, error: 'bad-target' });
    try {
      const totals = await query("SELECT COUNT(*) FILTER(WHERE vote='up')::int likes, COUNT(*) FILTER(WHERE vote='down')::int dislikes FROM vortex_ratings WHERE target_id=$1", [target]);
      let myVote = null;
      if (id(actorId)) { const mine = await query('SELECT vote FROM vortex_ratings WHERE target_id=$1 AND actor_id=$2', [target, actorId]); myVote = mine.rows[0]?.vote ?? null; }
      res.json({ ok: true, likes: totals.rows[0].likes, dislikes: totals.rows[0].dislikes, myVote });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/ratings/:targetId', async (req, res) => {
    const target = Number(req.params.targetId), actorId = actor(req), vote = req.body?.vote;
    if (!Number.isSafeInteger(target) || !id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (vote !== null && vote !== 'up' && vote !== 'down') return res.status(400).json({ ok: false, error: 'bad-vote' });
    try {
      if (vote === null) await query('DELETE FROM vortex_ratings WHERE target_id=$1 AND actor_id=$2', [target, actorId]);
      else await query('INSERT INTO vortex_ratings(target_id,actor_id,vote) VALUES($1,$2,$3) ON CONFLICT(target_id,actor_id) DO UPDATE SET vote=EXCLUDED.vote', [target, actorId, vote]);
      res.json({ ok: true, myVote: vote });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/comments/:gameId', async (req, res) => {
    const gameId = Number(req.params.gameId);
    if (!Number.isSafeInteger(gameId)) return res.status(400).json({ ok: false, error: 'bad-game' });
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const result = await query('SELECT id,game_id "gameId",author_id "authorId",author_name "authorName",body,created_at "createdAt" FROM vortex_comments WHERE game_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [gameId, limit, offset]);
      res.json({ ok: true, comments: result.rows });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/comments/:gameId', async (req, res) => {
    const gameId = Number(req.params.gameId), actorId = actor(req), body = text(req.body?.body, 4000);
    if (!Number.isSafeInteger(gameId) || !id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!body) return res.status(400).json({ ok: false, error: 'bad-body' });
    try {
      const result = await query('INSERT INTO vortex_comments(game_id,author_id,author_name,body) VALUES($1,$2,$3,$4) RETURNING id,game_id "gameId",author_id "authorId",author_name "authorName",body,created_at "createdAt"', [gameId, actorId, text(req.body?.authorName, 120) || `Player ${actorId}`, body]);
      res.status(201).json({ ok: true, comment: result.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/forum/categories', (_req, res) => res.json({ ok: true, categories: [
    { id: 'general', label: 'General Discussion' },
    { id: 'help', label: 'Help & Support' },
    { id: 'offtopic', label: 'Off Topic' }
  ] }));

  app.get('/v1/forum/threads', async (req, res) => {
    const category = ['general', 'help', 'offtopic'].includes(req.query.category) ? req.query.category : 'general';
    try {
      const result = await query('SELECT id,category_id "categoryId",title,body,author_id "authorId",author_name "authorName",created_at "createdAt",updated_at "updatedAt" FROM vortex_threads WHERE category_id=$1 AND deleted=false ORDER BY created_at DESC LIMIT 50', [category]);
      res.json({ ok: true, categoryId: category, threads: result.rows });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/forum/threads', async (req, res) => {
    const actorId = actor(req), title = text(req.body?.title, 120), body = text(req.body?.body, 4000);
    const category = ['general', 'help', 'offtopic'].includes(req.body?.categoryId) ? req.body.categoryId : 'general';
    if (!id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!title || !body) return res.status(400).json({ ok: false, error: 'bad-body' });
    try {
      const result = await query('INSERT INTO vortex_threads(category_id,title,body,author_id,author_name) VALUES($1,$2,$3,$4,$5) RETURNING id,category_id "categoryId",title,body,author_id "authorId",author_name "authorName",created_at "createdAt"', [category, title, body, actorId, text(req.body?.authorName, 120) || `Player ${actorId}`]);
      res.status(201).json({ ok: true, thread: result.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/forum/threads/:threadId', async (req, res) => {
    try {
      const thread = await query('SELECT id,category_id "categoryId",title,body,author_id "authorId",author_name "authorName",created_at "createdAt",updated_at "updatedAt" FROM vortex_threads WHERE id=$1 AND deleted=false', [req.params.threadId]);
      if (!thread.rowCount) return res.status(404).json({ ok: false, error: 'not-found' });
      const posts = await query('SELECT id,thread_id "threadId",author_id "authorId",author_name "authorName",body,created_at "createdAt",updated_at "updatedAt" FROM vortex_posts WHERE thread_id=$1 AND deleted=false ORDER BY created_at', [req.params.threadId]);
      res.json({ ok: true, thread: thread.rows[0], posts: posts.rows });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/forum/threads/:threadId/posts', async (req, res) => {
    const actorId = actor(req), body = text(req.body?.body, 4000);
    if (!id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!body) return res.status(400).json({ ok: false, error: 'bad-body' });
    try {
      const thread = await query('SELECT 1 FROM vortex_threads WHERE id=$1 AND deleted=false', [req.params.threadId]);
      if (!thread.rowCount) return res.status(404).json({ ok: false, error: 'not-found' });
      const result = await query('INSERT INTO vortex_posts(thread_id,author_id,author_name,body) VALUES($1,$2,$3,$4) RETURNING id,thread_id "threadId",author_id "authorId",author_name "authorName",body,created_at "createdAt"', [req.params.threadId, actorId, text(req.body?.authorName, 120) || `Player ${actorId}`, body]);
      res.status(201).json({ ok: true, post: result.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/dm/unread', async (req, res) => {
    const actorId = actor(req);
    if (!id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try { const result = await query('SELECT COUNT(*)::int count FROM vortex_dm_messages WHERE recipient_id=$1 AND read_at IS NULL', [actorId]); res.json({ ok: true, count: result.rows[0].count }); }
    catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.get('/v1/dm/threads/:peerId', async (req, res) => {
    const actorId = actor(req);
    if (!id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const result = await query('SELECT id,sender_id "senderId",recipient_id "recipientId",author_name "authorName",body,created_at "createdAt" FROM vortex_dm_messages WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at', [actorId, req.params.peerId]);
      await query('UPDATE vortex_dm_messages SET read_at=NOW() WHERE sender_id=$2 AND recipient_id=$1 AND read_at IS NULL', [actorId, req.params.peerId]);
      res.json({ ok: true, messages: result.rows });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });

  app.post('/v1/dm/threads/:peerId/messages', async (req, res) => {
    const actorId = actor(req), body = text(req.body?.body, 4000);
    if (!id(actorId)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!body) return res.status(400).json({ ok: false, error: 'bad-body' });
    try {
      const result = await query('INSERT INTO vortex_dm_messages(sender_id,recipient_id,author_name,body) VALUES($1,$2,$3,$4) RETURNING id,sender_id "senderId",recipient_id "recipientId",author_name "authorName",body,created_at "createdAt"', [actorId, req.params.peerId, text(req.body?.authorName, 120) || `Player ${actorId}`, body]);
      res.status(201).json({ ok: true, message: result.rows[0] });
    } catch (e) { res.status(500).json({ ok: false, error: 'db-error', message: e.message }); }
  });
}
