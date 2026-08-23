import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from '../../services/config/guildConfig.js';
import { isBotOwner } from '../../config/bot.js';
import { isGlobalAIEnabled, setGlobalAIEnabled, isAIConfigured } from '../../services/aiChat.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Manage Blue AI')
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('server')
            .setDescription('Enable or disable AI for this server')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether AI should be enabled in this server')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('global')
            .setDescription('Enable or disable AI globally (bot owner only)')
            .addBooleanOption(option => option
                .setName('enabled')
                .setDescription('Whether AI should be enabled globally')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Show the current AI status')),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'global') {
            if (!isBotOwner(interaction.user.id)) {
                return interaction.reply({ content: 'Only the bot owner can change the global AI switch.', ephemeral: true });
            }

            const enabled = interaction.options.getBoolean('enabled', true);
            setGlobalAIEnabled(enabled);
            logger.info('AI global setting changed', {
                event: 'ai.global.toggle',
                userId: interaction.user.id,
                guildId: interaction.guildId,
                enabled
            });
            return interaction.reply({ embeds: [createEmbed({
                title: 'Blue AI — Global',
                description: `Global AI is now **${enabled ? 'ON' : 'OFF'}**.`
            })] });
        }

        const guildConfig = await getGuildConfig(client, interaction.guildId);

        if (subcommand === 'server') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: 'You need Manage Server to change this setting.', ephemeral: true });
            }

            const enabled = interaction.options.getBoolean('enabled', true);
            await updateGuildConfig(client, interaction.guildId, {
                ...guildConfig,
                ai: { ...(guildConfig.ai || {}), enabled }
            }, { userId: interaction.user.id, reason: 'ai.server.toggle' });

            logger.info('AI server setting changed', {
                event: 'ai.server.toggle',
                userId: interaction.user.id,
                guildId: interaction.guildId,
                enabled
            });
            return interaction.reply({ embeds: [createEmbed({
                title: 'Blue AI — Server',
                description: `AI for this server is now **${enabled ? 'ON' : 'OFF'}**.`
            })] });
        }

        return interaction.reply({ embeds: [createEmbed({
            title: 'Blue AI — Status',
            description: [
                `Global: **${isGlobalAIEnabled() ? 'ON' : 'OFF'}**`,
                `Server: **${guildConfig?.ai?.enabled !== false ? 'ON' : 'OFF'}**`,
                `API: **${isAIConfigured() ? 'configured' : 'not configured'}**`,
                'AI only responds when both global and server switches are ON.'
            ].join('\n')
        })], ephemeral: true });
    }
};
