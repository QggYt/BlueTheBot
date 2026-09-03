import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketfeedback')
    .setDescription('Send feedback about your ticket experience')
    .addIntegerOption(o => o.setName('rating').setDescription('Rate the support from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('comment').setDescription('Optional feedback').setRequired(false).setMaxLength(1000)),
  category: 'Ticket',
  async execute(interaction, config, client) {
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const feedbackChannelId = guildConfig?.ticketFeedbackChannelId || guildConfig?.ticketLogsChannelId;
    const rating = interaction.options.getInteger('rating');
    const comment = interaction.options.getString('comment') || 'No comment provided.';

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🎫 Ticket Feedback')
      .setDescription(`**Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n**User:** ${interaction.user}\n**Ticket:** ${interaction.channel?.name || 'Unknown'}\n**Comment:** ${comment}`)
      .setTimestamp();

    let sent = false;
    if (feedbackChannelId) {
      const channel = await client.channels.fetch(feedbackChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed] }).then(() => { sent = true; }).catch(() => {});
      }
    }

    await interaction.reply({
      content: sent
        ? 'Thanks! Your ticket feedback was sent to the staff team.'
        : 'Thanks! Your feedback was received, but no ticket feedback/log channel is configured yet.',
      ephemeral: true,
    });
  },
};
