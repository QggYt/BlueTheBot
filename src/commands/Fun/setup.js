import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../../services/config/guildConfig.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up automatic chat revival for a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('channel').setDescription('Channel to monitor').setRequired(true))
    .addIntegerOption(o => o.setName('time').setDescription('Inactive minutes before revival').setMinValue(1).setMaxValue(10080).setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to ping when chat is inactive').setRequired(true)),
  category: 'Fun',

  async execute(interaction, config, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need Manage Server.')], ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const timeMinutes = interaction.options.getInteger('time');
    if (!channel.isTextBased?.()) {
      return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid Channel', 'Choose a text channel.')], ephemeral: true });
    }
    const current = await getGuildConfig(client, interaction.guildId);
    const channels = { ...(current.chatReviver?.channels || {}) };
    channels[channel.id] = { enabled: true, timeMinutes, roleId: role.id };
    await updateGuildConfig(client, interaction.guildId, { chatReviver: { channels } });
    return InteractionHelper.safeReply(interaction, {
      embeds: [successEmbed('Chat Reviver Enabled', `Monitoring <#${channel.id}> every **${timeMinutes} minutes**. I will ping <@&${role.id}> and start a new conversation when the chat is inactive.`)]
    });
  },
};
