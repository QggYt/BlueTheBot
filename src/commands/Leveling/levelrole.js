import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelrole')
    .setDescription('Manage automatic role rewards for leveling')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Give a role when a member reaches a level')
        .addIntegerOption((option) =>
          option
            .setName('level')
            .setDescription('The level required to receive the role')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to give')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a level role reward')
        .addIntegerOption((option) =>
          option
            .setName('level')
            .setDescription('The level reward to remove')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List all level role rewards')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'You need ManageGuild permission to use this command.'
    );
    if (!hasPermission) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const rewards = levelingConfig?.roleRewards || {};
      const entries = Object.entries(rewards)
        .map(([level, roleId]) => ({ level: Number(level), roleId }))
        .filter(({ level, roleId }) => Number.isInteger(level) && roleId)
        .sort((a, b) => a.level - b.level);

      const description = entries.length
        ? entries
            .map(({ level, roleId }) => {
              const role = interaction.guild.roles.cache.get(roleId);
              return `**Level ${level}** → ${role ? role.toString() : `Unknown role (${roleId})`}`;
            })
            .join('\n')
        : 'No level role rewards are configured.';

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('Level Role Rewards')
            .setDescription(description)
        ],
      });
      return;
    }

    const level = interaction.options.getInteger('level');
    const rewards = { ...(levelingConfig?.roleRewards || {}) };

    if (subcommand === 'remove') {
      if (!rewards[level]) {
        await InteractionHelper.safeEditReply(interaction, {
          content: `There is no role reward configured for level ${level}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      delete rewards[level];
      await saveLevelingConfig(client, interaction.guildId, {
        ...levelingConfig,
        roleRewards: rewards,
      });

      await InteractionHelper.safeEditReply(interaction, {
        content: `Removed the role reward for level ${level}.`,
      });
      return;
    }

    const role = interaction.options.getRole('role');
    const botMember = interaction.guild.members.me;

    if (!role || !botMember) {
      throw new TitanBotError(
        'Role or bot member unavailable',
        ErrorTypes.USER_INPUT,
        'I could not access that role right now.'
      );
    }

    if (role.managed) {
      await InteractionHelper.safeEditReply(interaction, {
        content: 'That role is managed by Discord/integration and cannot be assigned by the bot.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (role.id === interaction.guild.id) {
      await InteractionHelper.safeEditReply(interaction, {
        content: 'I cannot use @everyone as a level reward.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (role.position >= botMember.roles.highest.position) {
      await InteractionHelper.safeEditReply(interaction, {
        content: `I cannot assign ${role.toString()} because it is above or equal to my highest role. Move my bot role above it in Server Settings → Roles.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    rewards[level] = role.id;

    await saveLevelingConfig(client, interaction.guildId, {
      ...levelingConfig,
      roleRewards: rewards,
    });

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('Level Role Set')
          .setDescription(`Members who reach **Level ${level}** will now receive ${role.toString()}.`)
      ],
    });

    logger.info(
      `[LEVELING] Set level ${level} role reward to ${role.id} in guild ${interaction.guildId}`
    );
  },
};
