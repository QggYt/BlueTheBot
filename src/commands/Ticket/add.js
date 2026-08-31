import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getCurrentTicket, requireTicketManager } from './modules/extendedTicketCommands.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a member to the current ticket')
    .setDMPermission(false)
    .addUserOption(o => o.setName('member').setDescription('Member to add').setRequired(true)),
  category: 'Ticket',
  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const ticket = await getCurrentTicket(interaction);
    if (!ticket || !(await requireTicketManager(interaction, ticket))) return;
    const member = interaction.options.getMember('member');
    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
    });
    await InteractionHelper.safeEditReply(interaction, { content: `✅ Added ${member} to this ticket.` });
  },
};
