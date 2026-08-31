import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createTicket } from '../../services/ticket.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';

export default {
  data: new SlashCommandBuilder()
    .setName('new')
    .setDescription('Create a new support ticket')
    .setDMPermission(false)
    .addStringOption(o => o.setName('reason').setDescription('Why you need support').setRequired(false))
    .addStringOption(o => o.setName('priority').setDescription('Ticket priority').setRequired(false).addChoices(
      { name: 'None', value: 'none' }, { name: 'Low', value: 'low' }, { name: 'Medium', value: 'medium' },
      { name: 'High', value: 'high' }, { name: 'Urgent', value: 'urgent' },
    )),
  category: 'Ticket',
  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const config = await getGuildConfig(interaction.client, interaction.guildId);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const priority = interaction.options.getString('priority') || 'none';
    const result = await createTicket(interaction.guild, interaction.member, config.ticketCategoryId || null, reason, priority);
    await InteractionHelper.safeEditReply(interaction, {
      content: `✅ Ticket created: ${result.channel}`,
    });
  },
};
