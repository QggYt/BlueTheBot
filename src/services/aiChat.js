const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-3.5-flash-lite';
const DEFAULT_BASE_URL = (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const MAX_HISTORY = 4;

const conversations = new Map();

function getKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

function remember(key, role, content) {
  const history = conversations.get(key) || [];
  history.push({ role, content });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(key, history);
  return history;
}

function trim(text, max = 1900) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

export function isAIConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function askAI({ guildId, channelId, userId, userName, question, botName, allowedMentions = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'My AI is not configured yet. Add `GEMINI_API_KEY` to the bot\'s environment and restart me.';
  }

  const key = getKey(guildId, channelId, userId);
  const history = remember(key, 'user', question);

  const mentionRules = allowedMentions.length
    ? `The user explicitly mentioned these Discord users/roles and they are allowed to be pinged: ${allowedMentions.join(', ')}. If the user asks you to ping, notify, or call one of them, include the exact Discord mention token in your response. Do not invent or alter mention IDs.`
    : 'No Discord users or roles were explicitly mentioned in this message. Do not create or invent Discord mention IDs.';

  const system = [
    `You are ${botName}, a helpful Discord bot.`,
    'Answer the user directly and naturally.',
    'You can help with general questions, explanations, coding, gaming, Linux, Discord, and everyday topics.',
    'Do not claim to have performed an action you did not perform.',
    'Keep Discord replies concise unless the user asks for detail.',
    `The current Discord user is ${userName}.`,
    mentionRules
  ].join(' ');

  try {
    const response = await fetch(`${DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: system }, ...history],
        max_tokens: 400
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = new Error(`AI HTTP ${response.status}: ${errorText.slice(0, 500)}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI returned an empty response');

    remember(key, 'assistant', answer);
    return trim(answer);
  } catch (error) {
    const historyNow = conversations.get(key) || [];
    if (historyNow.at(-1)?.role === 'user' && historyNow.at(-1)?.content === question) historyNow.pop();
    conversations.set(key, historyNow);

    if (error?.status === 429) {
      throw new Error('Gemini free-tier rate limit reached. Please wait a little and try again.');
    }
    throw error;
  }
}

export function clearAIConversation(guildId, channelId, userId) {
  conversations.delete(getKey(guildId, channelId, userId));
}
