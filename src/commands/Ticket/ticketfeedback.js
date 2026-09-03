import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData, saveTicketData } from '../../utils/database/tickets.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketfeedback')
    .setDescription('Send feedback about your ticket experience')
    .addIntegerOption(o => o.setName('rating').setDescription('Rate the support from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('comment').setDescription('Optional feedback').setRequired(false).setMaxLength(1000)),
  category: 'Ticket',

  async execute(interaction, config, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const rating = interaction.options.getInteger('rating');
    const comment = interaction.options.getString('comment') || 'No comment provided.';
    const ticketChannelId = interaction.channelId;

    // The Ticket Dashboard stores the configured destination here.
    const logsChannelId = guildConfig?.ticketLogsChannelId;

    // Save the feedback to the ticket record so /tickets statistics can use it.
    const ticketData = await getTicketData(interaction.guildId, ticketChannelId).catch(() => null);
    if (ticketData) {
      ticketData.feedback = {
        rating,
        comment,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        submittedAt: new Date().toISOString(),
      };
      await saveTicketData(interaction.guildId, ticketChannelId, ticketData).catch(error => {
        logger.error('Failed to save ticket feedback', {
          guildId: interaction.guildId,
          channelId: ticketChannelId,
          error: error.message,
        });
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🎫 Ticket Feedback')
      .setDescription(
        `**Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n` +
        `**User:** ${interaction.user}\n` +
        `**Ticket:** ${interaction.channel?.name || 'Unknown'}\n` +
        `**Comment:** ${comment}`,
      )
      .setTimestamp();

    let sent = false;
    let failureReason = null;

    if (!logsChannelId) {
      failureReason = 'No Ticket Logs Channel is configured.';
    } else {
      const channel = await client.channels.fetch(logsChannelId).catch(error => {
        failureReason = `Could not find the configured Ticket Logs Channel: ${error.message}`;
        return null;
      });

      if (!channel) {
        failureReason ||= 'The configured Ticket Logs Channel no longer exists.';
      } else if (!channel.isTextBased() || !channel.isSendable?.()) {
        failureReason = 'The bot cannot send messages in the configured Ticket Logs Channel.';
      } else {
        try {
          await channel.send({ embeds: [embed] });
          sent = true;
        } catch (error) {
          failureReason = `Failed to send feedback to the Ticket Logs Channel: ${error.message}`;
          logger.error('Ticket feedback log send failed', {
            guildId: interaction.guildId,
            channelId: logsChannelId,
            error: error.message,
          });
        }
      }
    }

    if (!sent) {
      logger.warn('Ticket feedback was submitted but was not sent to the configured logs channel', {
        guildId: interaction.guildId,
        ticketChannelId,
        logsChannelId,
        reason: failureReason,
      });
    }

    await interaction.reply({
      content: sent
        ? 'Thanks! Your ticket feedback was sent to the staff logs.'
        : `Thanks! Your feedback was saved, but it could not be sent to the ticket logs. ${failureReason || 'Please check the Ticket Logs Channel setting and bot permissions.'}`,
      ephemeral: true,
    });
  },
};
