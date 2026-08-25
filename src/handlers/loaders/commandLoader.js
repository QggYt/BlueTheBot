import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;

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
            const command = commandModule.default || commandModule;
            if (!command.data || !command.execute) {
                logger.warn(`Command at ${filePath} is missing data or execute`);
                continue;
            }
            command.category = path.basename(path.dirname(filePath));
            command.filePath = normalizedPath;
            if (!uniqueNames.has(command.data.name)) {
                uniqueNames.add(command.data.name);
                client.commands.set(command.data.name, command);
            }
            logger.info(`Loaded command: ${command.data.name}`);
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    logger.info(`Loaded ${client.commands.size} unique commands`);
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
    // CLIENT_ID = Discord application/bot ID only.
    // SERVER_ID = Discord server (guild) ID only.
    const clientId = String(options.clientId || client.user?.id || botConfig.clientId || '').trim();
    const serverId = String(options.serverId || botConfig.serverId || process.env.SERVER_ID || '').trim();

    if (!clientId) throw new Error('CLIENT_ID (Discord application/bot ID) is required');
    if (!/^\d{17,20}$/.test(clientId)) throw new Error('CLIENT_ID must be the numeric Discord application/bot ID, not the server ID or bot token');
    if (serverId && !/^\d{17,20}$/.test(serverId)) throw new Error('SERVER_ID must be the numeric Discord server/guild ID, not the bot/application ID');
    if (!client.rest) throw new Error('Discord REST client is not available');

    const { commands, totalSubcommands } = collectCommandPayloads(client);
    validateCommands(commands);
    if (commands.length > MAX_COMMANDS) throw new Error(`Discord allows ${MAX_COMMANDS} top-level commands; found ${commands.length}`);

    const route = serverId
        ? `/applications/${clientId}/guilds/${serverId}/commands`
        : `/applications/${clientId}/commands`;
    const scope = serverId ? `server ${serverId}` : 'global application scope';

    logger.info(`Registering ${commands.length} ${scope} commands (${totalSubcommands} subcommands)`);
    await client.rest.put(route, { body: commands });
    logger.info(`Successfully registered ${commands.length} ${scope} commands`);
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    if (!command) return { success: false, message: `Command \"${commandName}\" not found` };
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());
        const newCommand = (await import(moduleUrl.href)).default;
        client.commands.set(commandName, newCommand);
        return { success: true, message: `Successfully reloaded command \"${commandName}\"` };
    } catch (error) {
        logger.error(`Error reloading command \"${commandName}\":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}
