import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import { Collection, ActionRowBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const BACK_BUTTON_ID = 'help-back-to-main';
const ALL_COMMANDS_ID = 'help-all-commands';
const PAGINATION_PREFIX = 'help-page';
const CATEGORY_SELECT_ID = 'help-category-select';
const FOOTER_TEXT = 'Made with ❤️';
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: 'ℹ️',
    Moderation: '🛡️',
    Economy: '💰',
    Music: '🎵',
    Fun: '🎮',
    Leveling: '📊',
    Utility: '🔧',
    Ticket: '🎫',
    Welcome: '👋',
    Giveaway: '🎉',
    Counter: '🔢',
    Tools: '🛠️',
    Search: '🔍',
    'Reaction Roles': '🎭',
    Community: '👥',
    Birthday: '🎂',
    'Join To Create': '🔌',
    Verification: '✅',
    Info: '📚',
};

function formatCategoryName(rawCategory) {
    return String(rawCategory || '')
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCategoryIcon(category) {
    return CATEGORY_ICONS[formatCategoryName(category)] || '🔹';
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) return null;
    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) return null;
    return {
        ...jsonData,
        options: Array.isArray(jsonData.options) ? jsonData.options : [],
    };
}

function buildHelpEntries(command) {
    const data = normalizeCommandData(command);
    if (!data) return [];

    const category = formatCategoryName(command.category || 'Other');
    const entries = [];
    const pushSubcommand = (name, description, prefix = data.name) => {
        entries.push({
            baseName: data.name,
            displayName: `${prefix} ${name}`,
            description: description || data.description || 'No description',
            category,
        });
    };

    for (const option of data.options || []) {
        if (option.type === SUBCOMMAND_TYPE) {
            pushSubcommand(option.name, option.description);
        } else if (option.type === SUBCOMMAND_GROUP_TYPE) {
            for (const nested of option.options || []) {
                if (nested?.type === SUBCOMMAND_TYPE) {
                    pushSubcommand(nested.name, nested.description || option.description, `${data.name} ${option.name}`);
                }
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName: data.name,
            displayName: data.name,
            description: data.description || 'No description',
            category,
        });
    }

    return entries;
}

function getActiveHelpEntries(client) {
    const entries = [];
    const seen = new Set();
    for (const command of client?.commands?.values?.() || []) {
        for (const entry of buildHelpEntries(command)) {
            const key = `${entry.baseName}:${entry.displayName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push(entry);
        }
    }
    return entries;
}

async function fetchRegisteredCommands(client) {
    const registeredCommands = new Collection();
    try {
        for (const command of await client.application.commands.fetch()) {
            registeredCommands.set(command[1]?.name || command.name, command[1] || command);
        }

        for (const guild of client.guilds?.cache?.values?.() || []) {
            try {
                const guildCommands = await guild.commands.fetch();
                for (const command of guildCommands.values()) {
                    registeredCommands.set(command.name, command);
                }
            } catch (error) {
                logger.debug(`Could not fetch guild commands for ${guild.id}:`, error?.message);
            }
        }
    } catch (error) {
        logger.debug('Could not fetch registered commands for Help:', error?.message);
    }
    return registeredCommands;
}

function getStatsGuild(client) {
    const configuredId = process.env.SERVER_ID || process.env.GUILD_ID;
    if (configuredId && client?.guilds?.cache?.has(configuredId)) return client.guilds.cache.get(configuredId);
    return client?.guilds?.cache?.first?.() || null;
}

function addServerStats(embed, client) {
    const guild = getStatsGuild(client);
    if (!guild) return;
    const members = Number(guild.memberCount || 0);
    const bots = guild.members?.cache ? guild.members.cache.filter((member) => member.user?.bot).size : 0;
    embed.addFields({
        name: '📊 Server Stats',
        value: `🧑┃members-${members}  🤖┃bots-${bots}`,
        inline: false,
    });
}

function makeRegisteredName(entry, registeredCommands) {
    const registered = registeredCommands.get(entry.baseName);
    return registered?.id ? `</${entry.displayName}:${registered.id}>` : `\`/${entry.displayName}\``;
}

async function createCategoryCommandsMenu(category, client) {
    const requestedCategory = formatCategoryName(category);
    const entries = getActiveHelpEntries(client)
        .filter((entry) => entry.category === requestedCategory)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);

    const embed = createEmbed({
        title: `${getCategoryIcon(requestedCategory)} ${requestedCategory} Commands`,
        description: entries.length ? 'These are the commands currently loaded and registered by BlueTheBot.' : 'No active commands found in this category.',
    });

    if (entries.length) {
        const lines = entries.map((entry) => `${getCategoryIcon(requestedCategory)} ${makeRegisteredName(entry, registeredCommands)} · ${entry.description}`);
        const chunks = [];
        let current = '';
        for (const line of lines) {
            if ((current + '\n' + line).length > 1000) {
                if (current) chunks.push(current);
                current = line;
            } else {
                current += (current ? '\n' : '') + line;
            }
        }
        if (current) chunks.push(current);
        chunks.forEach((chunk, index) => embed.addFields({
            name: `Commands${chunks.length > 1 ? ` (Part ${index + 1})` : ''}`,
            value: chunk,
            inline: false,
        }));
    }

    addServerStats(embed, client);
    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(BACK_BUTTON_ID, 'Back', 'primary', '⬅️', false);
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(backButton)] };
}

export async function createAllCommandsMenu(page = 1, client) {
    const commandsPerPage = 45;
    const allCommands = getActiveHelpEntries(client).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);
    const totalPages = Math.max(1, Math.ceil(allCommands.length / commandsPerPage));
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const startIndex = (safePage - 1) * commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, startIndex + commandsPerPage);

    const embed = createEmbed({
        title: '📋 All Commands',
        description: `Showing ${allCommands.length} active command entries. These are generated from the live command registry, so duplicate or failed files are not shown.`,
    });

    addServerStats(embed, client);

    if (pageCommands.length) {
        const lines = pageCommands.map((entry) => `${getCategoryIcon(entry.category)} ${makeRegisteredName(entry, registeredCommands)} · ${entry.category}`);
        const columnCount = lines.length > 20 ? 3 : lines.length > 10 ? 2 : 1;
        const chunkSize = Math.ceil(lines.length / columnCount);
        for (let i = 0; i < columnCount; i++) {
            const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n');
            if (!chunk) continue;
            embed.addFields({
                name: i === 0 ? `Commands (Page ${safePage})` : 'Commands (cont.)',
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    embed.setFooter({ text: `Page ${safePage}/${totalPages} · ${FOOTER_TEXT}` });
    embed.setTimestamp();

    const components = [];
    if (totalPages > 1) components.push(getPaginationRow(PAGINATION_PREFIX, safePage, totalPages));
    components.push(new ActionRowBuilder().addComponents(createButton(BACK_BUTTON_ID, 'Back', 'primary', '⬅️', false)));
    return { embeds: [embed], components, currentPage: safePage, totalPages };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            const selectedCategory = interaction.values[0];
            const result = selectedCategory === ALL_COMMANDS_ID
                ? await createAllCommandsMenu(1, client)
                : await createCategoryCommandsMenu(selectedCategory, client);
            await interaction.editReply({ embeds: result.embeds, components: result.components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) return;
            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
};
