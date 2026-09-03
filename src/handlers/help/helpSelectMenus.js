import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import { Collection, ActionRowBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const BACK_BUTTON_ID = 'help-back-to-main';
const ALL_COMMANDS_ID = 'help-all-commands';
const PAGINATION_PREFIX = 'help-page';
const CATEGORY_PAGE_PREFIX = 'help-cat-page';
const CATEGORY_SELECT_ID = 'help-category-select';
const FOOTER_TEXT = 'Made with ❤️';
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: 'ℹ️', Moderation: '🛡️', Economy: '💰', Music: '🎵', Fun: '🎮',
    Leveling: '📊', Utility: '🔧', Ticket: '🎫', Welcome: '👋', Giveaway: '🎉',
    Counter: '🔢', Tools: '🛠️', Search: '🔍', 'Reaction Roles': '🎭', Community: '👥',
    Birthday: '🎂', 'Join To Create': '🔌', Verification: '✅', Info: '📚',
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
    return { ...jsonData, options: Array.isArray(jsonData.options) ? jsonData.options : [] };
}

function buildHelpEntries(command) {
    const data = normalizeCommandData(command);
    if (!data) return [];
    const category = formatCategoryName(command.category || 'Other');
    const entries = [];
    const pushSubcommand = (name, description, prefix = data.name) => entries.push({
        baseName: data.name,
        displayName: `${prefix} ${name}`,
        description: description || data.description || 'No description',
        category,
    });

    for (const option of data.options || []) {
        if (option.type === SUBCOMMAND_TYPE) pushSubcommand(option.name, option.description);
        else if (option.type === SUBCOMMAND_GROUP_TYPE) {
            for (const nested of option.options || []) {
                if (nested?.type === SUBCOMMAND_TYPE) {
                    pushSubcommand(nested.name, nested.description || option.description, `${data.name} ${option.name}`);
                }
            }
        }
    }

    if (entries.length === 0) entries.push({
        baseName: data.name,
        displayName: data.name,
        description: data.description || 'No description',
        category,
    });
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
                for (const command of guildCommands.values()) registeredCommands.set(command.name, command);
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
    embed.addFields({ name: '📊 Server Stats', value: `🧑┃members-${members}  🤖┃bots-${bots}`, inline: false });
}

function makeRegisteredName(entry, registeredCommands) {
    const registered = registeredCommands.get(entry.baseName);
    return registered?.id ? `</${entry.displayName}:${registered.id}>` : `\`/${entry.displayName}\``;
}

function makeCategoryPageId(category, action) {
    return `${CATEGORY_PAGE_PREFIX}:${encodeURIComponent(category)}:${action}`.substring(0, 100);
}

export async function createCategoryCommandsMenu(category, page = 1, client) {
    const requestedCategory = formatCategoryName(category);
    const entries = getActiveHelpEntries(client)
        .filter((entry) => entry.category === requestedCategory)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);
    const commandsPerPage = 25;
    const totalPages = Math.max(1, Math.ceil(entries.length / commandsPerPage));
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const pageEntries = entries.slice((safePage - 1) * commandsPerPage, safePage * commandsPerPage);

    const embed = createEmbed({
        title: `${getCategoryIcon(requestedCategory)} ${requestedCategory} Commands`,
        description: entries.length
            ? `Showing ${entries.length} active command entries for this category.`
            : 'No active commands found in this category.',
    });

    if (pageEntries.length) {
        const lines = pageEntries.map((entry) => `${getCategoryIcon(requestedCategory)} ${makeRegisteredName(entry, registeredCommands)} · ${entry.description}`);
        let current = '';
        let part = 1;
        for (const line of lines) {
            if ((current + '\n' + line).length > 1000) {
                if (current) embed.addFields({ name: `Commands${totalPages > 1 ? ` (Page ${safePage})` : ''}${part > 1 ? ` · Part ${part}` : ''}`, value: current, inline: false });
                current = line;
                part++;
            } else current += (current ? '\n' : '') + line;
        }
        if (current) embed.addFields({ name: `Commands${totalPages > 1 ? ` (Page ${safePage})` : ''}${part > 1 ? ` · Part ${part}` : ''}`, value: current, inline: false });
    }

    addServerStats(embed, client);
    embed.setFooter({ text: `Page ${safePage}/${totalPages} · ${FOOTER_TEXT}` });
    embed.setTimestamp();

    const components = [];
    if (totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
            createButton(makeCategoryPageId(requestedCategory, 'first'), '⏮️', 'secondary', null, safePage === 1),
            createButton(makeCategoryPageId(requestedCategory, 'prev'), '◀️', 'secondary', null, safePage === 1),
            createButton(makeCategoryPageId(requestedCategory, 'page'), `Page ${safePage} of ${totalPages}`, 'secondary', null, true),
            createButton(makeCategoryPageId(requestedCategory, 'next'), '▶️', 'secondary', null, safePage >= totalPages),
            createButton(makeCategoryPageId(requestedCategory, 'last'), '⏭️', 'secondary', null, safePage >= totalPages),
        ));
    }
    components.push(new ActionRowBuilder().addComponents(createButton(BACK_BUTTON_ID, 'Back', 'primary', '⬅️', false)));
    return { embeds: [embed], components, currentPage: safePage, totalPages, category: requestedCategory };
}

export async function createAllCommandsMenu(page = 1, client) {
    const commandsPerPage = 45;
    const allCommands = getActiveHelpEntries(client).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);
    const totalPages = Math.max(1, Math.ceil(allCommands.length / commandsPerPage));
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const pageCommands = allCommands.slice((safePage - 1) * commandsPerPage, safePage * commandsPerPage);

    const embed = createEmbed({
        title: '📋 All Commands',
        description: `Showing ${allCommands.length} active command entries. Duplicate command entries are filtered before display.`,
    });
    addServerStats(embed, client);

    if (pageCommands.length) {
        const lines = pageCommands.map((entry) => `${getCategoryIcon(entry.category)} ${makeRegisteredName(entry, registeredCommands)} · ${entry.category}`);
        const columnCount = lines.length > 20 ? 3 : lines.length > 10 ? 2 : 1;
        const chunkSize = Math.ceil(lines.length / columnCount);
        for (let i = 0; i < columnCount; i++) {
            const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize).join('\n');
            if (chunk) embed.addFields({ name: i === 0 ? `Commands (Page ${safePage})` : 'Commands (cont.)', value: chunk, inline: columnCount > 1 });
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
                : await createCategoryCommandsMenu(selectedCategory, 1, client);
            await interaction.editReply({ embeds: result.embeds, components: result.components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) return;
            await handleInteractionError(interaction, error, { type: 'select_menu', customId: interaction.customId, handler: 'help_category' });
        }
    },
};

export async function handleHelpPagination(interaction, client) {
    const customId = interaction.customId;
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

        if (customId.startsWith(`${PAGINATION_PREFIX}_`)) {
            const action = customId.slice(`${PAGINATION_PREFIX}_`.length);
            const current = Number(interaction.message?.embeds?.[0]?.footer?.text?.match(/Page (\d+)\//)?.[1]) || 1;
            const total = Number(interaction.message?.embeds?.[0]?.footer?.text?.match(/Page \d+\/(\d+)/)?.[1]) || 1;
            let page = current;
            if (action === 'first') page = 1;
            else if (action === 'prev') page--;
            else if (action === 'next') page++;
            else if (action === 'last') page = total;
            const result = await createAllCommandsMenu(page, client);
            await interaction.editReply({ embeds: result.embeds, components: result.components });
            return true;
        }

        if (customId.startsWith(`${CATEGORY_PAGE_PREFIX}:`)) {
            const [, encodedCategory, action] = customId.split(':');
            const category = decodeURIComponent(encodedCategory || '');
            const current = Number(interaction.message?.embeds?.[0]?.footer?.text?.match(/Page (\d+)\//)?.[1]) || 1;
            const total = Number(interaction.message?.embeds?.[0]?.footer?.text?.match(/Page \d+\/(\d+)/)?.[1]) || 1;
            let page = current;
            if (action === 'first') page = 1;
            else if (action === 'prev') page--;
            else if (action === 'next') page++;
            else if (action === 'last') page = total;
            const result = await createCategoryCommandsMenu(category, page, client);
            await interaction.editReply({ embeds: result.embeds, components: result.components });
            return true;
        }
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) return true;
        await handleInteractionError(interaction, error, { type: 'button', customId, handler: 'help_pagination' });
        return true;
    }
    return false;
}
