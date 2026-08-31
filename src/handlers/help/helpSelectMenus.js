import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Made with ❤️";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
    Config: "⚙️",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildHelpEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) return [];

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];
    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
                category,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            for (const nested of option.options || []) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;
                entries.push({
                    baseName,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: nested.description || option.description || baseDescription,
                    category,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            displayName: baseName,
            description: baseDescription,
            category,
        });
    }

    return entries;
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) return null;

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) return null;

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}

async function fetchRegisteredCommands(client) {
    const registeredCommands = new Collection();

    try {
        if (!client?.application?.commands?.fetch) return registeredCommands;

        // Fetch both global and guild-scoped commands. Blue registers to a
        // server when SERVER_ID is configured, while this help menu previously
        // checked only the global application command list.
        const globalCommands = await client.application.commands.fetch();
        for (const cmd of globalCommands.values()) {
            registeredCommands.set(cmd.name, cmd);
        }

        for (const guild of client.guilds?.cache?.values?.() || []) {
            try {
                const guildCommands = await guild.commands.fetch();
                for (const cmd of guildCommands.values()) {
                    registeredCommands.set(cmd.name, cmd);
                }
            } catch (error) {
                logger.debug(`Could not fetch commands for guild ${guild.id}:`, error?.message);
            }
        }
    } catch (error) {
        logger.error('Error fetching registered commands:', error);
    }

    return registeredCommands;
}

async function createCategoryCommandsMenu(category, client) {
    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";
    const categoryCommands = [];

    try {
        const categoryPath = path.join(__dirname, "../../commands", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter((file) => file.endsWith(".js"))
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData) {
                if (commandData.name === "help" || commandData.name === "commandlist") continue;
                categoryCommands.push(...buildHelpEntries(command, categoryName));
            }
        }
    } catch (error) {
        logger.error(`Error reading commands from category ${category}:`, error);
    }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `Click any command mention below to use it.`
            : `No commands found in the **${categoryName}** category.`,
    });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands
            .map((cmd) => {
                const registeredCmd = registeredCommands.get(cmd.baseName);
                if (registeredCmd?.id) {
                    return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.description}`;
                }
                return `\`/${cmd.displayName}\` · ${cmd.description}`;
            })
            .join("\n");

        const maxLength = 1000;
        if (commandMentions.length <= maxLength) {
            embed.addFields({ name: "Commands", value: commandMentions, inline: false });
        } else {
            const chunks = [];
            let currentChunk = "";
            for (const line of commandMentions.split("\n")) {
                if ((currentChunk + "\n" + line).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? "\n" : "") + line;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: `Commands (Part ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(BACK_BUTTON_ID, "Back", "primary", "⬅️", false);
    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(backButton)],
    };
}

export async function createAllCommandsMenu(page = 1, client) {
    const commandsPerPage = 45;
    const allCommands = [];
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    for (const category of categoryDirs) {
        try {
            const categoryPath = path.join(__dirname, "../../commands", category);
            const commandFiles = (await fs.readdir(categoryPath))
                .filter((file) => file.endsWith(".js"))
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData) {
                    if (commandData.name === "help" || commandData.name === "commandlist") continue;
                    allCommands.push(...buildHelpEntries(command, formatCategoryName(category)));
                }
            }
        } catch (error) {
            logger.error(`Error reading commands from category ${category}:`, error);
        }
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const registeredCommands = await fetchRegisteredCommands(client);
    const totalPages = Math.max(1, Math.ceil(allCommands.length / commandsPerPage));
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const startIndex = (safePage - 1) * commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, startIndex + commandsPerPage);

    const embed = createEmbed({
        title: "📋 All Commands",
        description: `Browse every available command in one list. Use the page buttons below to move through the full set.`,
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands.map((cmd) => {
            const registeredCmd = registeredCommands.get(cmd.baseName);
            if (registeredCmd?.id) {
                return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.category}`;
            }
            return `\`/${cmd.displayName}\` · ${cmd.category}`;
        });

        const columnCount = pageCommands.length > 20 ? 3 : (pageCommands.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(commandMentions.length / columnCount);

        for (let i = 0; i < columnCount; i++) {
            const chunk = commandMentions.slice(i * chunkSize, (i + 1) * chunkSize).join("\n");
            if (!chunk) continue;
            embed.addFields({
                name: i === 0 ? `Commands (Page ${safePage})` : "Commands (cont.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components = [];
    if (totalPages > 1) {
        components.push(getPaginationRow(PAGINATION_PREFIX, safePage, totalPages));
    }

    const backButton = createButton(BACK_BUTTON_ID, "Back", "primary", "⬅️", false);
    components.push(new ActionRowBuilder().addComponents(backButton));

    return { embeds: [embed], components, currentPage: safePage, totalPages };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client);
                await interaction.editReply({ embeds, components });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client);
                await interaction.editReply({ embeds, components });
            }
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
};
