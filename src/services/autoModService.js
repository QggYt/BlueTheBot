const userState = new Map();

const CONFIG = {
  maxMessages: 6,
  windowMs: 5000,
  duplicateLimit: 3,
  maxMentions: 8,
  maxCapsLength: 12,
  capsRatio: 0.8,
  timeoutMs: 10 * 60 * 1000,
  warningDeleteMs: 10000
};

function getState(guildId, userId) {
  const key = `${guildId}:${userId}`;
  let state = userState.get(key);
  if (!state) {
    state = { timestamps: [], lastContent: '', duplicates: 0, warnedAt: 0 };
    userState.set(key, state);
  }
  return state;
}

function looksLikeInvite(content) {
  return /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i.test(content);
}

function isExcessiveCaps(content) {
  const letters = content.match(/[a-z]/gi) || [];
  const upper = content.match(/[A-Z]/g) || [];
  return letters.length >= CONFIG.maxCapsLength && upper.length / letters.length >= CONFIG.capsRatio;
}

export async function checkAutoMod(message) {
  if (!message.guild || message.author.bot) return { blocked: false };

  const member = message.member;
  if (member?.permissions?.has('ManageMessages') || member?.permissions?.has('Administrator')) {
    return { blocked: false };
  }

  const content = message.content || '';
  const state = getState(message.guild.id, message.author.id);
  const now = Date.now();
  state.timestamps = state.timestamps.filter(t => now - t < CONFIG.windowMs);
  state.timestamps.push(now);

  let reason = null;
  if (looksLikeInvite(content)) reason = 'Discord invite links are not allowed.';
  else if (message.mentions.users.size + message.mentions.roles.size > CONFIG.maxMentions) reason = 'Too many mentions in one message.';
  else if (isExcessiveCaps(content)) reason = 'Please avoid excessive caps.';
  else if (state.lastContent && content.trim().length > 0 && content.trim().toLowerCase() === state.lastContent.toLowerCase()) {
    state.duplicates += 1;
    if (state.duplicates >= CONFIG.duplicateLimit) reason = 'Please avoid repeating the same message.';
  } else {
    state.duplicates = 0;
  }

  state.lastContent = content.trim();

  if (!reason && state.timestamps.length > CONFIG.maxMessages) {
    reason = 'You are sending messages too quickly.';
  }

  if (!reason) return { blocked: false };

  const deleted = await message.delete().then(() => true).catch(() => false);
  state.warnedAt = now;

  let timedOut = false;
  if (member?.moderatable) {
    timedOut = await member.timeout(CONFIG.timeoutMs, `AutoMod: ${reason}`).then(() => true).catch(() => false);
  }

  return { blocked: true, reason, deleted, timedOut };
}

export function clearAutoModState() {
  userState.clear();
}
