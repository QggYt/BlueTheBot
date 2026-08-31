import { createEmbed } from '../../utils/embeds.js';
import { createInitialHelpMenu } from '../../commands/Core/help.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const BACK_BUTTON_ID = "help-back-to-main";
const BUG_REPORT_BUTTON_ID = "help-bug-report";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client, interaction.guild);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help back button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }
            throw error;
        }
    },
};

export const helpBugReportButton = {
    name: BUG_REPORT_BUTTON_ID,
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Report Bug on GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const bugRow = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Bug Report',
            description: 'Found a bug? Please report it on our GitHub Issues page!\n\n' +
                '**When reporting a bug, please include:**\n' +
                '• 📝 Detailed description of the issue\n' +
                '• 📋 Steps to reproduce the problem\n' +
                '• 📸 Screenshots if applicable\n' +
                '• 💻 Your bot version and environment\n\n' +
                'This helps us fix issues faster and more effectively!',
            color: 'error'
        });
        bugReportEmbed.setFooter({
            text: 'TitanBot Bug Reporting System',
            iconURL: client.user.displayAvatarURL()
        });
        bugReportEmbed.setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [bugRow],
            flags: MessageFlags.Ephemeral
        });
    },
};
