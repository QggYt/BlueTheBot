import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;

// Keep implementations in their original files, but expose related features
// through a single Discord slash-command root. This prevents duplicate roots
// while preserving every implementation as a subcommand.
const COMMAND_FAMILIES = {
    music: {
        category: 'Music',
        description: 'Manage music playback, queue, and voice controls',
        members: ['join', 'nowplaying', 'play', 'queue'],
    },
    ticket: {
        category: 'Ticket',
        description: 'Manage the server ticket system',
        members: ['add', 'claim', 'close', 'force-close', 'move', 'new', 'priority', 'release', 'remove', 'rename', 'tag', 'ticketfeedback', 'tickets'],
    },
    mod: {
        category: 'Moderation',
        description: 'Moderation and server safety tools',
        members: ['ban', 'cases', 'dm', 'kick', 'lock', 'massban', 'masskick', 'purge', 'say', 'timeout', 'unban', 'unlock', 'untimeout', 'usernotes'],
    },
    info: {
        category: 'Info',
        description: 'Server, user, role, and general information tools',
        members: [
            'dynoavatar', 'membercount', 'server', 'serverinfo', 'serverstats',
            'whois', 'userinfo', 'avatar', 'roleinfo', 'roles', 'color',
            'randomcolor', 'discrim', 'distance', 'emotes', 'commandstats',
        ],
        rootMember: 'info',
        rootSubcommand: 'about',
    },
    giveaway: {
        category: 'Giveaway',
        description: 'Create, manage, end, and reroll giveaways',
        members: ['gcreate', 'gdelete', 'gend', 'greroll'],
    },
    level: {
        category: 'Leveling',
        description: 'Manage leveling, ranks, rewards, and leaderboards',
        members: ['leaderboard', 'leveladd', 'levelremove', 'levelrole', 'levelset', 'rank'],
        rootMember: 'level',
    },
    verification: {
        category: 'Verification',
        description: 'Configure and manage member verification',
        members: ['autoverify', 'verify'],
        rootMember: 'verification',
    },
    tts: {
        category: 'Community',
        description: 'Text-to-speech voice controls',
        members: ['tts-stop'],
        rootMember: 'tts',
    },
};

function getSubcommandInfo(commandData) {
    const subcommands = [];
    for (const option of commandData.options || []) {
        if (option.type === 1) subcommands.push(option.name);
        else if (option.type === 2) {
            for (const subOption of option.options || []) {
                if (subOption.type === 1) subcommands.push(`${option.name}/${subOption.name}`);
            }
        }
    }
    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            if (file.name !== 'modules') await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) fileList.push(filePath);
    }
    return fileList;
}

function commandToJson(command) {
    if (!command?.data || typeof command.data.toJSON !== 'function') return null;
    return command.data.toJSON();
}

function asSubcommand(commandJson, name = commandJson.name) {
    const options = commandJson.options || [];
    const hasNestedCommands = options.some(option => option.type === 1 || option.type === 2);
    if (hasNestedCommands) {
        return {
            type: 2,
            name,
            description: commandJson.description || `Manage ${name}`,
            options,
        };
    }
    return {
        type: 1,
        name,
        description: commandJson.description || `Run ${name}`,
        options,
    };
}

function addFamilyMember(memberName, command, payloadOptions, dispatchMap) {
    const json = commandToJson(command);
    if (!json) return;

    const options = json.options || [];
    const hasNestedCommands = options.some(option => option.type === 1 || option.type === 2);

    if (hasNestedCommands) {
        payloadOptions.push(asSubcommand(json, memberName));
        for (const option of options) {
            if (option.type === 1) {
                dispatchMap.set(`${memberName}:${option.name}`, command);
            } else if (option.type === 2) {
                for (const subOption of option.options || []) {
                    if (subOption.type === 1) dispatchMap.set(`${memberName}:${option.name}:${subOption.name}`, command);
                }
            }
        }
    } else {
        payloadOptions.push(asSubcommand(json, memberName));
        dispatchMap.set(memberName, command);
    }
}

function consolidateCommandFamilies(client) {
    const originalCommands = new Map(client.commands);
    let consolidated = 0;

    for (const [familyName, family] of Object.entries(COMMAND_FAMILIES)) {
        const root = originalCommands.get(family.rootMember || familyName);
        const members = [];
        const dispatchMap = new Map();
        const payloadOptions = [];

        if (root) {
            const rootJson = commandToJson(root);
            if (rootJson) {
                const rootOptions = rootJson.options || [];
                if (rootOptions.some(option => option.type === 1 || option.type === 2)) {
                    for (const option of rootOptions) {
                        if (option.type === 1) {
                            payloadOptions.push(option);
                            dispatchMap.set(option.name, root);
                        } else if (option.type === 2) {
                            payloadOptions.push(option);
                            for (const subOption of option.options || []) {
                                if (subOption.type === 1) dispatchMap.set(`${option.name}:${subOption.name}`, root);
                            }
                        }
                    }
                } else if (family.rootSubcommand) {
                    payloadOptions.push({
                        type: 1,
                        name: family.rootSubcommand,
                        description: rootJson.description || `Run ${family.rootSubcommand}`,
                        options: rootOptions,
                    });
                    dispatchMap.set(family.rootSubcommand, root);
                } else {
                    // A plain command cannot be a family root without changing
                    // its original invocation, so expose it as the first subcommand.
                    payloadOptions.push({
                        type: 1,
                        name: 'default',
                        description: rootJson.description || `Run ${familyName}`,
                        options: rootOptions,
                    });
                    dispatchMap.set('default', root);
                }
            }
            members.push(root.data.name);
        }

        for (const memberName of family.members) {
            if (memberName === family.rootMember) continue;
            const command = originalCommands.get(memberName);
            if (!command) continue;
            addFamilyMember(memberName, command, payloadOptions, dispatchMap);
            members.push(memberName);
        }

        if (payloadOptions.length === 0) continue;
        if (payloadOptions.length > 25) {
            logger.warn(`Command family /${familyName} has ${payloadOptions.length} subcommands; leaving it unconsolidated.`);
            continue;
        }

        const familyCommand = {
            category: family.category,
            filePath: root?.filePath || originalCommands.get(family.members[0])?.filePath || '',
            familyName,
            familyMembers: members,
            data: {
                name: familyName,
                description: family.description,
                toJSON: () => ({
                    name: familyName,
                    description: family.description,
                    options: payloadOptions,
                    type: 1,
                }),
            },
            async execute(interaction, config, botClient) {
                const group = interaction.options.getSubcommandGroup(false);
                const sub = interaction.options.getSubcommand(false);
                const key = group ? `${group}:${sub}` : sub;
                const command = dispatchMap.get(key);
                if (!command) {
                    await interaction.reply({ content: `Unknown /${familyName} subcommand.`, ephemeral: true }).catch(() => {});
                    return;
                }
                return command.execute(interaction, config, botClient);
            },
        };

        for (const memberName of members) client.commands.delete(memberName);
        client.commands.set(familyName, familyCommand);
        consolidated += Math.max(0, members.length - 1);
        logger.info(`Consolidated /${familyName}: ${members.join(', ')}`);
    }

    logger.info(`Consolidated ${consolidated} top-level commands into command families.`);
    return consolidated;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    logger.info(`Found ${commandFiles.length} command files to load`);
    const uniqueNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const commandModule = await import(`file://${filePath}`);
            const exported = commandModule.default || commandModule;
            const commands = Array.isArray(exported) ? exported : [exported];

            for (const command of commands) {
                if (!command?.data || !command?.execute) {
                    logger.warn(`Command at ${filePath} is missing data or execute`);
                    continue;
                }
                command.category = command.category || path.basename(path.dirname(filePath));
                command.filePath = normalizedPath;
                if (!uniqueNames.has(command.data.name)) {
                    uniqueNames.add(command.data.name);
                    client.commands.set(command.data.name, command);
                    logger.info(`Loaded command: ${command.data.name}`);
                } else {
                    logger.warn(`Skipped duplicate command: ${command.data.name}`);
                }
            }
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }

    const before = client.commands.size;
    consolidateCommandFamilies(client);
    logger.info(`Loaded ${client.commands.size} active slash command roots (from ${before} implementations)`);
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    const names = new Set();
    let totalSubcommands = 0;
    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') continue;
        if (names.has(command.data.name)) continue;
        names.add(command.data.name);
        const json = command.data.toJSON();
        commands.push(json);
        totalSubcommands += getSubcommandInfo(json).length;
    }
    return { commands, totalSubcommands };
}

function validateCommands(commands) {
    const errors = [];
    for (const cmd of commands) {
        if (!cmd.name || cmd.name.length > 32) errors.push(`Invalid command name: ${cmd.name}`);
        if (cmd.description && cmd.description.length > 100) errors.push(`${cmd.name}: description over 100 characters`);
        for (const option of cmd.options || []) {
            if (option.name?.length > 32) errors.push(`${cmd.name}.${option.name}: invalid option name`);
            if (option.description?.length > 100) errors.push(`${cmd.name}.${option.name}: description over 100 characters`);
        }
    }
    if (errors.length) throw new Error(`Command validation failed: ${errors.join('; ')}`);
}

export async function registerCommands(client, options = {}) {
    const clientId = String(options.clientId || client.user?.id || botConfig.clientId || '').trim();
    const configuredServerId = String(options.serverId || botConfig.serverId || process.env.SERVER_ID || process.env.GUILD_ID || '').trim();

    if (!clientId) throw new Error('CLIENT_ID (Discord application/bot ID) is required');
    if (!/^\d{17,20}$/.test(clientId)) throw new Error('CLIENT_ID must be the numeric Discord application/bot ID, not the server ID or bot token');
    if (!client.rest) throw new Error('Discord REST client is not available');

    const { commands, totalSubcommands } = collectCommandPayloads(client);
    validateCommands(commands);
    if (commands.length > MAX_COMMANDS) throw new Error(`Discord allows ${MAX_COMMANDS} top-level commands; found ${commands.length}`);

    if (configuredServerId && !/^\d{17,20}$/.test(configuredServerId)) {
        throw new Error('SERVER_ID/GUILD_ID must be the numeric Discord server/guild ID, not the bot/application ID');
    }

    logger.info(`Prepared ${commands.length} slash commands (${totalSubcommands} subcommands) for application ${clientId}`);

    if (configuredServerId) {
        const route = `/applications/${clientId}/guilds/${configuredServerId}/commands`;
        logger.info(`Registering ${commands.length} slash commands to configured server ${configuredServerId}`);
        await client.rest.put(route, { body: commands });
        logger.info(`Successfully registered ${commands.length} slash commands to server ${configuredServerId}`);
        return;
    }

    const guildIds = [...(client.guilds?.cache?.keys?.() || [])];
    if (guildIds.length === 0) {
        const route = `/applications/${clientId}/commands`;
        logger.info(`No guilds cached; registering ${commands.length} commands globally`);
        await client.rest.put(route, { body: commands });
        logger.info(`Successfully registered ${commands.length} global slash commands`);
        return;
    }

    logger.info(`SERVER_ID/GUILD_ID not configured; registering ${commands.length} slash commands to ${guildIds.length} cached guild(s)`);
    for (const guildId of guildIds) {
        const route = `/applications/${clientId}/guilds/${guildId}/commands`;
        logger.info(`Registering slash commands to guild ${guildId}`);
        await client.rest.put(route, { body: commands });
        logger.info(`Successfully registered ${commands.length} slash commands to guild ${guildId}`);
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command \"${commandName}\" not found` };
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const exported = (await import(moduleUrl.href)).default;
        const commands = Array.isArray(exported) ? exported : [exported];
        const replacement = commands.find(c => c?.data?.name === commandName);
        if (!replacement) return { success: false, message: `Command \"${commandName}\" is not exported by its file` };
        client.commands.set(commandName, replacement);
        return { success: true, message: `Successfully reloaded command \"${commandName}\"` };
    } catch (error) {
        logger.error(`Error reloading command \"${commandName}\":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}
