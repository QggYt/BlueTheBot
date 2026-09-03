import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';

function getApiBase(client) {
  const port = Number(client?.config?.api?.port || process.env.PORT || 3000);
  return process.env.VORTEX_API_URL || `http://127.0.0.1:${port}/v1`;
}

async function apiRequest(client, method, path, data = undefined, actorId = '') {
  const response = await axios({
    method,
    url: `${getApiBase(client)}${path}`,
    data,
    headers: { 'X-Vortex-Actor-Id': actorId || '' },
    timeout: 8_000,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    throw new Error(response.data?.error || `API returned HTTP ${response.status}`);
  }
  return response.data;
}

function targetOption(option, description) {
  return option
    .setName('target')
    .setDescription(description)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(32);
}

export default {
  data: new SlashCommandBuilder()
    .setName('vortex')
    .setDescription('Vortex07 tools')
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('Check the Vortex07 API status'))
    .addSubcommand(sub => sub
      .setName('comments')
      .setDescription('Show comments for a Vortex game')
      .addIntegerOption(option => targetOption(option, 'Vortex game ID')))
    .addSubcommand(sub => sub
      .setName('like')
      .setDescription('Like or unlike a Vortex target')
      .addIntegerOption(option => targetOption(option, 'Vortex target ID'))
      .addBooleanOption(option => option
        .setName('liked')
        .setDescription('True to like, false to unlike')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('rate')
      .setDescription('Rate a Vortex target')
      .addIntegerOption(option => targetOption(option, 'Vortex target ID'))
      .addStringOption(option => option
        .setName('vote')
        .setDescription('Choose a rating')
        .setRequired(true)
        .addChoices(
          { name: '👍 Up', value: 'up' },
          { name: '👎 Down', value: 'down' },
          { name: 'Remove rating', value: 'null' },
        ))),

  async execute(interaction, _config, client) {
    const subcommand = interaction.options.getSubcommand();
    const actorId = interaction.user.id;

    try {
      if (subcommand === 'health') {
        const result = await apiRequest(client, 'GET', '/health');
        return interaction.reply({
          content: result.ok
            ? `🟢 **Vortex07 API online**\nDatabase: ${result.database ? 'connected' : 'unavailable'}`
            : '🔴 Vortex07 API is unavailable.',
          ephemeral: true,
        });
      }

      const target = interaction.options.getInteger('target', true);

      if (subcommand === 'comments') {
        const result = await apiRequest(client, 'GET', `/comments/${target}?limit=10`);
        if (!result.comments?.length) {
          return interaction.reply(`💬 No comments found for Vortex game **${target}**.`);
        }
        const lines = result.comments.map(comment => {
          const author = String(comment.authorName || `User ${comment.authorId}`).slice(0, 80);
          const body = String(comment.body || '').replace(/\s+/g, ' ').slice(0, 180);
          return `• **${author}** — ${body}`;
        });
        return interaction.reply({
          content: `💬 **Comments for game ${target}**\n${lines.join('\n')}`.slice(0, 2000),
        });
      }

      if (subcommand === 'like') {
        const liked = interaction.options.getBoolean('liked', true);
        const result = await apiRequest(client, 'POST', `/likes/${target}`, { liked }, actorId);
        return interaction.reply({
          content: `${liked ? '❤️ Liked' : '💔 Unliked'} Vortex target **${target}**. Total likes: **${result.count ?? 0}**.`,
        });
      }

      const voteValue = interaction.options.getString('vote', true);
      const vote = voteValue === 'null' ? null : voteValue;
      await apiRequest(client, 'POST', `/ratings/${target}`, { vote }, actorId);
      return interaction.reply({
        content: vote
          ? `${vote === 'up' ? '👍' : '👎'} Rated Vortex target **${target}** as **${vote}**.`
          : `↩️ Removed your rating from Vortex target **${target}**.`,
      });
    } catch (error) {
      return interaction.reply({
        content: `❌ Vortex request failed: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};
