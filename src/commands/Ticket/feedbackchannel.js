import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { updateGuildConfig } from '../../services/config/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('feedbackchannel')
    .setDescription('Set the channel where ticket feedback is logged')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to receive ticket feedback logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category: 'Ticket',

  async execute(interaction, config, client) {
    const channel = interaction.options.getChannel('channel', true);

    if (!channel.isTextBased() || !channel.isSendable?.()) {
      return interaction.reply({
        content: '❌ I cannot send messages to that channel.',
        ephemeral: true,
      });
    }

    try {
      await updateGuildConfig(client, interaction.guildId, {
        ticketLogsChannelId: channel.id,
      });

      return interaction.reply({
        content: `✅ Ticket feedback logging is now set to ${channel}.\nAll ticket feedback will be sent there.`,
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({
        content: '❌ I could not save the feedback channel setting. Please check the bot logs.',
        ephemeral: true,
      });
    }
  },
};
