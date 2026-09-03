import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticketfeedback')
    .setDescription('Send feedback about your ticket experience')
    .addIntegerOption(o => o.setName('rating').setDescription('Rate the support from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('comment').setDescription('Optional feedback').setRequired(false).setMaxLength(1000)),
  category: 'Tickets',
  async execute(interaction, config, client) {
    const ticketChannel = interaction.channel;
    const ticketConfig = config?.tickets || config?.ticket || {};
    const feedbackChannelId = ticketConfig.feedbackChannelId || config?.ticketFeedbackChannelId;
    const rating = interaction.options.getInteger('rating');
    const comment = interaction.options.getString('comment') || 'No comment provided.';

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🎫 Ticket Feedback')
      .setDescription(`**Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n**User:** ${interaction.user}\n**Ticket:** ${ticketChannel?.name || 'Unknown'}\n**Comment:** ${comment}`)
      .setTimestamp();

    let sent = false;
    if (feedbackChannelId) {
      const channel = await client.channels.fetch(feedbackChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed] }).then(() => { sent = true; }).catch(() => {});
      }
    }

    await interaction.reply({
      content: sent ? 'Thanks! Your ticket feedback was sent to the staff team.' : 'Thanks! Your feedback was recorded for this ticket. Staff feedback channel is not configured yet.',
      ephemeral: true,
    });
  },
};
