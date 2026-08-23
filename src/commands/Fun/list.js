import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { infoEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List automatic chat revival channels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category: 'Fun',

  async execute(interaction, config, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need Manage Server.')], ephemeral: true });
    }
    const current = await getGuildConfig(client, interaction.guildId);
    const channels = Object.entries(current.chatReviver?.channels || {});
    if (!channels.length) {
      return InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('Chat Reviver', 'No channels are configured. Use `/setup` to add one.')] });
    }
    const lines = channels.map(([channelId, settings]) => `<#${channelId}> — **${settings.timeMinutes} min** — <@&${settings.roleId}>`);
    return InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('Chat Reviver Channels', lines.join('\n'))] });
  },
};
