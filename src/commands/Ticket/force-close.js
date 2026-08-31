import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { closeTicket } from '../../services/ticket.js';
import { getCurrentTicket, requireTicketManager } from './modules/extendedTicketCommands.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default { data:new SlashCommandBuilder().setName('force-close').setDescription('Force close the current ticket').setDMPermission(false).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(false)),category:'Ticket',async execute(i){await InteractionHelper.safeDefer(i,{flags:MessageFlags.Ephemeral});const t=await getCurrentTicket(i);if(!t||!(await requireTicketManager(i,t)))return;await closeTicket(i.channel,i.user,i.options.getString('reason')||'Force closed by staff.');await InteractionHelper.safeEditReply(i,{content:'✅ Ticket force-closed.'});}};
