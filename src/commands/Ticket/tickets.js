import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getGuildTicketStats } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default { data:new SlashCommandBuilder().setName('tickets').setDescription('Show ticket statistics for this server').setDMPermission(false),category:'Ticket',async execute(i){await InteractionHelper.safeDefer(i,{flags:MessageFlags.Ephemeral});const s=await getGuildTicketStats(i.guildId);await InteractionHelper.safeEditReply(i,{content:`🎫 **Ticket Stats**\n🟢 Open: **${s.openCount}**\n🔴 Closed: **${s.closedCount}**\n📊 Total: **${s.openCount+s.closedCount}**${s.avgRating!=null?`\n⭐ Average rating: **${s.avgRating}/5**`:''}`});}};
