import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../../services/config/guildConfig.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getRandomTopic } from '../../services/chatReviverService.js';

function getChannels(config) {
  return config.chatReviver?.channels || {};
}

export default {
  data: new SlashCommandBuilder()
    .setName('chatreviver')
    .setDescription('Prevent configured chats from going quiet.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Configure chat revival for a channel.')
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to monitor').setRequired(true))
      .addIntegerOption(opt => opt.setName('time').setDescription('Inactive minutes before revival').setMinValue(1).setMaxValue(10080).setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role to ping when the chat is inactive').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('delete')
      .setDescription('Remove chat revival from a channel.')
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to remove').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List configured chat revival channels.'))
    .addSubcommand(sub => sub
      .setName('topic')
      .setDescription('Get a random conversation starter.')),
  category: 'Fun',

  async execute(interaction, config, client) {
    const action = interaction.options.getSubcommand();

    if (action === 'topic') {
      return InteractionHelper.safeReply(interaction, {
        embeds: [infoEmbed('Conversation Topic', `**${getRandomTopic()}**`)]
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Permission Denied', 'You need Manage Server to configure Chat Reviver.')],
        ephemeral: true,
      });
    }

    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const channels = { ...getChannels(guildConfig) };

    if (action === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const timeMinutes = interaction.options.getInteger('time');

      if (!channel.isTextBased?.()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Invalid Channel', 'Please choose a text channel.')],
          ephemeral: true,
        });
      }

      channels[channel.id] = {
        enabled: true,
        timeMinutes,
        roleId: role.id,
      };

      await updateGuildConfig(client, interaction.guildId, {
        chatReviver: { channels },
      });

      return InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed(
          'Chat Reviver Enabled',
          `Monitoring <#${channel.id}>. If it is inactive for **${timeMinutes} minutes**, I will ping <@&${role.id}> and post a new conversation topic.`
        )]
      });
    }

    if (action === 'delete') {
      const channel = interaction.options.getChannel('channel');
      if (!channels[channel.id]) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Not Configured', `<#${channel.id}> does not have Chat Reviver enabled.`)],
          ephemeral: true,
        });
      }

      delete channels[channel.id];
      await updateGuildConfig(client, interaction.guildId, {
        chatReviver: { channels },
      });

      return InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Chat Reviver Removed', `Stopped monitoring <#${channel.id}>.`)]
      });
    }

    const entries = Object.entries(channels);
    if (!entries.length) {
      return InteractionHelper.safeReply(interaction, {
        embeds: [infoEmbed('Chat Reviver', 'No channels are configured yet. Use `/chatreviver setup`.')]
      });
    }

    const lines = entries.map(([channelId, settings]) =>
      `<#${channelId}> — every **${settings.timeMinutes} min** — ping <@&${settings.roleId}>`
    );

    return InteractionHelper.safeReply(interaction, {
      embeds: [infoEmbed('Chat Reviver Channels', lines.join('\n'))]
    });
  },
};
