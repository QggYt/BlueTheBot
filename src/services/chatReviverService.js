import { infoEmbed } from '../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const TOPICS = [
  'What game could you play for hours without getting bored?',
  'If you could instantly master one skill, what would it be?',
  'Which game deserves a sequel?',
  'What is the most useful app or website you use?',
  'What new feature would you add to your favorite game?',
  'What is the funniest thing that has happened to you while gaming?',
  'What fictional world would you want to visit for one day?',
  'What is an underrated hobby that more people should try?',
  'Would you rather explore space or the deepest parts of the ocean?',
  'What game do you think everyone should try at least once?',
  'If you could travel anywhere tomorrow, where would you go?',
  'What is a small thing that always makes your day better?',
  'What is your favorite way to spend a completely free day?',
  'If you could invent one thing, what would it do?',
  'Which fictional character would make the best Discord moderator?',
  'What is a game opinion you know will start a debate?',
  'What is one game you wish more people knew about?',
  'What was the first game you remember being really good at?',
  'What game has the best soundtrack in your opinion?',
  'If you could add one rule to every Discord server, what would it be?'
];

export function getRandomTopic() {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

export async function checkChatReviver(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await getGuildConfig(client, guild.id);
      const channels = config.chatReviver?.channels || {};
      const entries = Object.entries(channels);
      if (!entries.length) continue;

      let changed = false;
      for (const [channelId, settings] of entries) {
        if (!settings?.enabled) continue;

        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased?.() || !channel.messages?.fetch) continue;

        const latest = (await channel.messages.fetch({ limit: 1 })).first();
        if (!latest) continue;

        // A revive message from this bot is intentionally left as the latest message
        // so the channel does not get revived again every minute.
        if (latest.author?.id === client.user?.id && latest.embeds?.some(e => e.title === 'Chat Revived')) {
          continue;
        }

        const inactiveMs = Date.now() - latest.createdTimestamp;
        const thresholdMs = Math.max(1, Number(settings.timeMinutes) || 60) * 60 * 1000;
        if (inactiveMs < thresholdMs) continue;

        const roleId = settings.roleId;
        const topic = getRandomTopic();
        const mention = roleId ? `<@&${roleId}>` : '';
        const embed = infoEmbed('Chat Revived', `**${topic}**`);
        await channel.send({
          content: mention || undefined,
          embeds: [embed],
          allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
        });
      }

      if (changed) {
        await updateGuildConfig(client, guild.id, { chatReviver: { channels } });
      }
    } catch (error) {
      logger.warn(`Chat reviver check failed for guild ${guild.id}: ${error?.message || error}`);
    }
  }
}
