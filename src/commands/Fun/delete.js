import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../../services/config/guildConfig.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Remove automatic chat revival from a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('channel').setDescription('Channel to remove').setRequired(true)),
  category: 'Fun',

  async execute(interaction, config, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need Manage Server.')], ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const current = await getGuildConfig(client, interaction.guildId);
    const channels = { ...(current.chatReviver?.channels || {}) };
    if (!channels[channel.id]) {
      return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Not Configured', `<#${channel.id}> is not configured for Chat Reviver.`)], ephemeral: true });
    }
    delete channels[channel.id];
    await updateGuildConfig(client, interaction.guildId, { chatReviver: { channels } });
    return InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Chat Reviver Removed', `Stopped monitoring <#${channel.id}>.`)] });
  },
};
