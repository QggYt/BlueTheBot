import { fileURLToPath } from "url";
import path from "path";
import botConfig from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";
import { pgConfig } from "./database/postgres.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep credentials separate by purpose. Never use a server ID as a bot ID,
// and never pass a token through CLIENT_ID/SERVER_ID.
const rawToken = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN || "";
const discordToken = rawToken.trim().replace(/^Bot\s+/i, "");
const clientId = (process.env.CLIENT_ID || "").trim();
const serverId = (process.env.SERVER_ID || "").trim();

const appConfig = {
  paths: {
    root: path.join(__dirname, "../.."),
    commands: path.join(__dirname, "../commands"),
    events: path.join(__dirname, "../events"),
    config: __dirname,
    utils: path.join(__dirname, "../utils"),
    services: path.join(__dirname, "../services"),
    handlers: path.join(__dirname, "../handlers"),
    interactions: path.join(__dirname, "../interactions"),
  },

  bot: {
    ...botConfig,
    // DISCORD_TOKEN/BOT_TOKEN/TOKEN = bot authentication token only.
    // CLIENT_ID = Discord application/bot ID only.
    // SERVER_ID = Discord server/guild ID only.
    token: discordToken,
    clientId,
    serverId,

    // Backwards-compatible alias for older feature consumers.
    // This is the SERVER ID, never the bot/application ID.
    guildId: serverId,

    shop: {
      ...botConfig.shop,
      ...shop,
    },
  },

  postgresql: {
    ...pgConfig,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: {
      enabled: process.env.LOG_TO_FILE === "true",
      path: path.join(__dirname, "../../logs"),
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    },
    console: {
      enabled: true,
      colorize: true,
      timestamp: true,
    },
    sentry: {
      enabled: process.env.SENTRY_DSN ? true : false,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
    },
  },

  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  },

  shop,

  features: {
    ...botConfig.features,
    music: botConfig.features?.music ?? true,
  },

  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

Object.freeze(appConfig);

export default appConfig;
