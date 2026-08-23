import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vortex')
    .setDescription('Vortex07 API and community features')
    .addSubcommand(sub => sub
      .setName('health')
      .setDescription('Check the Vortex07 API status'))
    .addSubcommand(sub => sub
      .setName('like')
      .setDescription('Like or unlike a Vortex target')
      .addIntegerOption(o => o.setName('target').setDescription('Target ID').setRequired(true))
      .addBooleanOption(o => o.setName('liked').setDescription('True to like, false to unlike').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('rate')
      .setDescription('Rate a Vortex target')
      .addIntegerOption(o => o.setName('target').setDescription('Target ID').setRequired(true))
      .addStringOption(o => o.setName('vote').setDescription('Rating').setRequired(true).addChoices(
        { name: 'Up', value: 'up' }, { name: 'Down', value: 'down' }, { name: 'Remove', value: 'null' }
      )))
    .addSubcommand(sub => sub
      .setName('comments')
      .setDescription('Show comments for a Vortex game')
      .addIntegerOption(o => o.setName('game').setDescription('Game ID').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const base = process.env.VORTEX_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const actorId = interaction.user.id;
    const headers = { 'Content-Type': 'application/json', 'X-Vortex-Actor-Id': actorId };

    try {
      if (sub === 'health') {
        const r = await fetch(`${base}/v1/health`);
        const data = await r.json();
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vortex07 API').setDescription(data.ok ? '🟢 API is online and database is available.' : '🔴 API is unavailable.').setColor(data.ok ? 0x57f287 : 0xed4245)] });
      }

      if (sub === 'like') {
        const target = interaction.options.getInteger('target', true);
        const liked = interaction.options.getBoolean('liked', true);
        const r = await fetch(`${base}/v1/likes/${target}`, { method: 'POST', headers, body: JSON.stringify({ actorId, liked }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'API request failed');
        return interaction.reply(`❤️ Target **${target}** is now ${data.liked ? 'liked' : 'unliked'}. Total likes: **${data.count}**`);
      }

      if (sub === 'rate') {
        const target = interaction.options.getInteger('target', true);
        const rawVote = interaction.options.getString('vote', true);
        const vote = rawVote === 'null' ? null : rawVote;
        const r = await fetch(`${base}/v1/ratings/${target}`, { method: 'POST', headers, body: JSON.stringify({ actorId, vote }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'API request failed');
        return interaction.reply(`⭐ Target **${target}** rating updated to **${vote ?? 'none'}**.`);
      }

      if (sub === 'comments') {
        const game = interaction.options.getInteger('game', true);
        const r = await fetch(`${base}/v1/comments/${game}?limit=10`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'API request failed');
        const comments = data.comments?.length
          ? data.comments.map(c => `• **${c.authorName || c.authorId}**: ${String(c.body).slice(0, 500)}`).join('\n')
          : 'No comments yet.';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Vortex07 comments — game ${game}`).setDescription(comments).setColor(0x336699)] });
      }
    } catch (error) {
      return interaction.reply({ content: `❌ Vortex API error: ${error.message}`, ephemeral: true });
    }
  },
};
