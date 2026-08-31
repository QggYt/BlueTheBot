import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTicketData, saveTicketData } from '../../utils/database.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default { data:new SlashCommandBuilder().setName('topic').setDescription('Set the topic/reason for the current ticket').setDMPermission(false).addStringOption(o=>o.setName('text').setDescription('Ticket topic').setRequired(true)),category:'Ticket',async execute(i){await InteractionHelper.safeDefer(i,{flags:MessageFlags.Ephemeral});const ctx=await getTicketPermissionContext({client:i.client,interaction:i});if(!ctx.ticketData||!ctx.canManageTicket)return;const t=await getTicketData(i.guildId,i.channelId);t.topic=i.options.getString('text').slice(0,1000);await saveTicketData(i.guildId,i.channelId,t);await InteractionHelper.safeEditReply(i,{content:'✅ Ticket topic updated.'});}};
