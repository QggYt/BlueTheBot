import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

function getApiBase(client) {
  const port = Number(client?.config?.api?.port || process.env.PORT || 3000);
  const configured = process.env.VORTEX_API_URL || `http://127.0.0.1:${port}/v1`;
  return configured.replace(/\/$/, '');
}

async function apiRequest(client, method, path, data = undefined, actorId = '') {
  const response = await fetch(`${getApiBase(client)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Vortex-Actor-Id': actorId || '',
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.error || `API returned HTTP ${response.status}`);
  }
  return payload;
}

function integerOption(option, name, description) {
  return option
    .setName(name)
    .setDescription(description)
    .setRequired(true);
}

export default {
  data: new SlashCommandBuilder()
    .setName('vortex')
    .setDescription('Vortex07 API and community features')
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('Check the Vortex07 API status'))
    .addSubcommand(sub => sub
      .setName('comments')
      .setDescription('Show comments for a Vortex game')
      .addIntegerOption(option => integerOption(option, 'game', 'Vortex game ID')))
    .addSubcommand(sub => sub
      .setName('like')
      .setDescription('Like or unlike a Vortex target')
      .addIntegerOption(option => integerOption(option, 'target', 'Vortex target ID'))
      .addBooleanOption(option => option
        .setName('liked')
        .setDescription('True to like, false to unlike')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('rate')
      .setDescription('Rate a Vortex target')
      .addIntegerOption(option => integerOption(option, 'target', 'Vortex target ID'))
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
          embeds: [new EmbedBuilder()
            .setTitle('Vortex07 API')
            .setDescription(result.ok
              ? `🟢 API is online. Database: ${result.database ? 'connected' : 'unavailable'}.`
              : '🔴 API is unavailable.')],
          ephemeral: true,
        });
      }

      if (subcommand === 'comments') {
        const game = interaction.options.getInteger('game', true);
        const result = await apiRequest(client, 'GET', `/comments/${game}?limit=10`);
        const comments = result.comments?.length
          ? result.comments.map(comment => {
              const author = String(comment.authorName || `User ${comment.authorId}`).slice(0, 80);
              const body = String(comment.body || '').replace(/\s+/g, ' ').slice(0, 300);
              return `• **${author}** — ${body}`;
            }).join('\n')
          : 'No comments yet.';

        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle(`Vortex07 comments — game ${game}`)
            .setDescription(comments.slice(0, 4000))],
        });
      }

      const target = interaction.options.getInteger('target', true);

      if (subcommand === 'like') {
        const liked = interaction.options.getBoolean('liked', true);
        const result = await apiRequest(client, 'POST', `/likes/${target}`, { liked }, actorId);
        return interaction.reply(`❤️ Target **${target}** is now ${result.liked ? 'liked' : 'unliked'}. Total likes: **${result.count ?? 0}**`);
      }

      const rawVote = interaction.options.getString('vote', true);
      const vote = rawVote === 'null' ? null : rawVote;
      await apiRequest(client, 'POST', `/ratings/${target}`, { vote }, actorId);
      return interaction.reply(`⭐ Target **${target}** rating updated to **${vote ?? 'none'}**.`);
    } catch (error) {
      return interaction.reply({
        content: `❌ Vortex API error: ${error?.message || 'Unknown error'}`,
        ephemeral: true,
      });
    }
  },
};
