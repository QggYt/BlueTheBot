import { PermissionFlagsBits } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function getCurrentTicket(interaction) {
  const ticketData = await getTicketData(interaction.guildId, interaction.channelId);
  if (!ticketData || ticketData.status !== 'open' && ticketData.status !== 'closed') {
    await replyUserError(interaction, {
      type: ErrorTypes.VALIDATION,
      message: 'This command can only be used inside a ticket channel.',
    });
    return null;
  }
  return ticketData;
}

export async function requireTicketManager(interaction, ticketData) {
  const config = await getGuildConfig(interaction.client, interaction.guildId);
  const isManager = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
    || Boolean(config.ticketStaffRoleId && interaction.member.roles?.cache?.has(config.ticketStaffRoleId));
  if (!isManager) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: 'You need Manage Channels or the configured ticket staff role.',
    });
    return null;
  }
  return config;
}

export async function saveCurrentTicket(interaction, ticketData) {
  await saveTicketData(interaction.guildId, interaction.channelId, ticketData);
}

export function ticketTagList(ticketData) {
  return Array.isArray(ticketData.tags) ? ticketData.tags : [];
}
