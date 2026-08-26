import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';

const MAX_NAME = 90;

function cleanName(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_NAME);
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

export function looksLikeServerManagementRequest(text) {
  const value = String(text || '').toLowerCase();
  return /\b(create|make|add|delete|remove|rename|change|lock|unlock|clear)\b/.test(value)
    && /\b(role|channel|message|messages|server|category)\b/.test(value);
}

export async function handleAIServerManagement({ message, request }) {
  if (!message?.guild || !looksLikeServerManagementRequest(request)) return { handled: false };

  // AI server management is intentionally restricted to the bot owner.
  if (!isBotOwner(message.author.id)) {
    return { handled: true, success: false, message: 'Only the bot owner can ask me to make server changes.' };
  }

  const text = String(request || '').trim();
  const lower = text.toLowerCase();

  if (/\b(create|make|add)\b.*\brole\b/i.test(text)) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageRoles)) return { handled: true, success: false, message: 'I need Manage Roles permission to create a role.' };
    const match = text.match(/\b(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?role\s+(?:called|named)?\s*["'`]?([^"'`\n]+?)["'`]?(?:\s*$|\s+(?:role|please)$)/i);
    const name = cleanName(match?.[1] || text.replace(/^.*?\brole\b/i, '').replace(/^\s*(?:called|named)\s+/i, ''));
    if (!name) return { handled: true, success: false, message: 'Tell me the role name, for example: “create a role called Moderator”.' };
    const role = await message.guild.roles.create({ name, reason: `AI server management requested by ${message.author.tag}` });
    return { handled: true, success: true, message: `✅ Created the role **${role.name}**.` };
  }

  if (/\b(create|make|add)\b.*\b(channel|text channel)\b/i.test(text)) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return { handled: true, success: false, message: 'I need Manage Channels permission to create a channel.' };
    const match = text.match(/\b(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?(?:text\s+)?channel\s+(?:called|named)?\s*["'`]?([^"'`\n]+?)["'`]?(?:\s*$|\s+(?:channel|please)$)/i);
    const name = cleanName(match?.[1] || text.replace(/^.*?\b(?:text\s+)?channel\b/i, '').replace(/^\s*(?:called|named)\s+/i, ''));
    if (!name) return { handled: true, success: false, message: 'Tell me the channel name, for example: “create a channel called announcements”.' };
    const channel = await message.guild.channels.create({ name, type: ChannelType.GuildText, reason: `AI server management requested by ${message.author.tag}` });
    return { handled: true, success: true, message: `✅ Created <#${channel.id}>.` };
  }

  if (/\b(delete|remove)\b.*\b(this|that|the)?\s*message\b/i.test(text)) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageMessages)) return { handled: true, success: false, message: 'I need Manage Messages permission to delete messages.' };
    let target = null;
    if (message.reference?.messageId) target = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!target) return { handled: true, success: false, message: 'Reply to the message you want me to delete, then tell me to delete it.' };
    await target.delete();
    return { handled: true, success: true, message: '✅ Deleted the referenced message.' };
  }

  if (/\b(rename|change)\b.*\bchannel\b/i.test(text)) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return { handled: true, success: false, message: 'I need Manage Channels permission to rename a channel.' };
    const match = text.match(/\b(?:rename|change)\b.*?\bchannel\b(?:\s+(?:to|as|called|named))?\s*["'`]?([^"'`\n]+?)["'`]?(?:\s*$)/i);
    const name = cleanName(match?.[1]);
    if (!name) return { handled: true, success: false, message: 'Tell me the new channel name.' };
    await message.channel.setName(name, `AI server management requested by ${message.author.tag}`);
    return { handled: true, success: true, message: `✅ Renamed the channel to **${name}**.` };
  }

  if (lower.includes('lock') && lower.includes('channel')) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return { handled: true, success: false, message: 'I need Manage Channels permission to lock a channel.' };
    const everyone = message.guild.roles.everyone;
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `AI server management requested by ${message.author.tag}` });
    return { handled: true, success: true, message: '🔒 Locked this channel for @everyone.' };
  }

  if (lower.includes('unlock') && lower.includes('channel')) {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return { handled: true, success: false, message: 'I need Manage Channels permission to unlock a channel.' };
    const everyone = message.guild.roles.everyone;
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: `AI server management requested by ${message.author.tag}` });
    return { handled: true, success: true, message: '🔓 Unlocked this channel for @everyone.' };
  }

  return { handled: false };
}
