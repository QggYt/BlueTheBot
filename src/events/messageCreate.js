import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { getCountingGameConfig, saveCountingGameConfig, isValidCountingMessage, recordCorrectCount } from '../services/countingGameService.js';
import { askAI, isAIConfigured, isAIEnabled } from '../services/aiChat.js';
import { checkAutoMod } from '../services/autoModService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;
      logger.debug('Message received', { event: 'message.received', guildId: message.guild.id, channelId: message.channel.id, userId: message.author.id });

      const autoMod = await checkAutoMod(message);
      if (autoMod.blocked) {
        const action = autoMod.timedOut ? ' You have been timed out for 10 minutes.' : '';
        await message.channel.send({ content: `⚠️ <@${message.author.id}> ${autoMod.reason}${action}`, allowedMentions: { users: [message.author.id] } })
          .then(sent => setTimeout(() => sent.delete().catch(() => {}), 10000)).catch(() => {});
        return;
      }

      if (client.user && message.mentions.users.has(client.user.id)) {
        const cleaned = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (!cleaned && !message.attachments.some(a => a.contentType?.startsWith('image/'))) {
          await message.reply({ content: `Hey ${message.author}! 👋 I'm **${client.user.username}**. Mention me with a question and I'll answer, or use \/help for commands.` }).catch(error => logger.warn('Failed to reply to bot mention:', error?.message));
          return;
        }

        const guildConfig = await getGuildConfig(client, message.guild.id);
        if (!isAIEnabled(guildConfig)) {
          await message.reply({ content: 'AI is currently disabled for this server or globally.' }).catch(error => logger.warn('Failed to reply to disabled AI:', error?.message));
          return;
        }
        if (!isAIConfigured()) {
          await message.reply({ content: 'I can answer questions, but the local AI service is not configured yet.' }).catch(error => logger.warn('Failed to reply to AI configuration error:', error?.message));
          return;
        }

        const thinking = await message.reply({ content: '🤔 Thinking...' }).catch(() => null);
        try {
          const allowedUsers = message.mentions.users.filter(user => user.id !== client.user.id).map(user => user.id);
          const allowedRoles = message.mentions.roles.map(role => role.id);
          const allowedMentions = [...allowedUsers.map(id => `<@${id}>`), ...allowedRoles.map(id => `<@&${id}>`)];

          const recent = await message.channel.messages.fetch({ limit: 12 }).catch(() => null);
          const channelMessages = recent ? [...recent.values()]
            .filter(m => !m.author.bot && m.id !== message.id)
            .reverse()
            .map(m => ({ author: m.author.username, content: m.content })) : [];

          const images = [...message.attachments.values()]
            .filter(a => a.contentType?.startsWith('image/'))
            .slice(0, 3)
            .map(a => ({ url: a.url, contentType: a.contentType }));

          const answer = await askAI({
            guildId: message.guild.id,
            channelId: message.channel.id,
            userId: message.author.id,
            userName: message.author.username,
            question: cleaned || 'Describe the attached image(s).',
            botName: 'Blue',
            allowedMentions,
            channelMessages,
            images,
          });
          const replyOptions = { content: answer, allowedMentions: { users: allowedUsers, roles: allowedRoles } };
          if (thinking) await thinking.edit(replyOptions); else await message.reply(replyOptions);
        } catch (error) {
          logger.error('AI reply failed:', error);
          const content = 'I couldn\'t reach my local AI service right now. Check that the local model is running.';
          if (thinking) await thinking.edit({ content }).catch(() => {}); else await message.reply({ content }).catch(() => {});
        }
        return;
      }

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) return;
      await handlePrefixCommand(message, client);
      await handleLeveling(message, client);
    } catch (error) { logger.error('Error in messageCreate event:', error); }
  }
};

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    if (!parsed) return;
    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) { commandName = 'music'; args = [musicPrefixShortcut, ...args]; }
    logger.info(`Prefix command detected: ${commandName}`);
    const resolvedCommandName = resolveCommandAlias(commandName);
    const command = client.commands.get(resolvedCommandName);
    if (!command) return;
    if (isMaintenanceMode() && !isBotOwner(message.author.id)) { await message.channel.send({ embeds: [createEmbed({ title: 'Maintenance Mode', description: getBotMessage('maintenanceMode'), color: 'warning' })] }).catch(() => {}); return; }
    if (!isCommandCategoryEnabled(command.category)) { await message.channel.send({ embeds: [createEmbed({ title: 'Feature Disabled', description: getBotMessage('commandDisabled'), color: 'error' })] }).catch(() => {}); return; }
    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) { if (restriction.blocked && restriction.reason) await message.channel.send({ embeds: [createEmbed({ title: 'Slash Command Only', description: `${restriction.reason}\nUse \/${resolvedCommandName} instead.`, color: 'info' })] }).catch(() => {}); return; }
    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) { await message.channel.send({ embeds: [createEmbed({ title: 'Command Disabled', description: 'This command has been disabled for this server.', color: 'error' })] }).catch(() => {}); return; }
    const abuseProtection = await enforceAbuseProtection({ guildId: message.guild.id, user: message.author }, command, resolvedCommandName);
    if (!abuseProtection.allowed) { await message.channel.send({ embeds: [createEmbed({ title: 'Command Cooldown', description: `This command is on cooldown. Please wait ${formatCooldownDuration(abuseProtection.remainingMs)} before trying again.`, color: 'error' })] }).catch(() => {}); return; }
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) { logger.error('Error handling prefix command:', error); }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) return false;
    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;
    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, { ...config, nextNumber: 1, lastUserId: null, currentStreak: 0 });
      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => failureMessage.delete().catch(() => {}), 10000);
      return true;
    }
    await recordCorrectCount(client, message.guild.id, message.author.id);
    await message.react('✅').catch((error) => logger.warn('Failed to add counting success reaction:', error?.message));
    return true;
  } catch (error) { logger.error('Error handling counting game:', error); return false; }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    if (!await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS)) return;
    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    if (!levelingConfig?.enabled || levelingConfig.ignoredChannels?.includes(message.channel.id)) return;
    if (levelingConfig.ignoredRoles?.length > 0) { const member = await message.guild.members.fetch(message.author.id).catch(() => null); if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return; }
    if (levelingConfig.blacklistedUsers?.includes(message.author.id) || !message.content?.trim()) return;
    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    const cooldownTime = levelingConfig.xpCooldown || 60;
    if (Date.now() - (userData.lastMessage || 0) < cooldownTime * 1000) return;
    const minXP = Math.max(1, levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15);
    const maxXP = Math.max(minXP, levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25);
    let finalXP = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    const result = await addXp(client, message.guild, message.member, finalXP);
    if (result?.leveledUp) logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
  } catch (error) { logger.error('Error handling leveling for message:', error); }
}
