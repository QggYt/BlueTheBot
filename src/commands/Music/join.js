import { SlashCommandBuilder } from 'discord.js';
import {
    joinVoiceChannel as connectToVoice,
    entersState,
    VoiceConnectionStatus,
    getVoiceConnection,
} from '@discordjs/voice';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel without starting playback'),

    async execute(interaction) {
        await deferMusicCommand(interaction);

        const channel = interaction.member?.voice?.channel;
        if (!channel) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Voice Channel Required', 'You need to join a voice channel first.')],
            });
            return;
        }

        const permissions = channel.permissionsFor(interaction.guild.members.me);
        if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Missing Permissions', 'I need **Connect** and **Speak** permissions in that voice channel.')],
            });
            return;
        }

        const guildId = interaction.guild.id;
        const existing = getVoiceConnection(guildId);
        if (existing && existing.joinConfig.channelId !== channel.id) {
            existing.destroy();
        }

        const connection = connectToVoice({
            channelId: channel.id,
            guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (error) {
            connection.destroy();
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Voice Connection Failed', 'I could not connect to that voice channel. Check my Connect/Speak permissions and try again.')],
            });
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                'Joined Voice Channel',
                `Connected to **${channel.name}**. The bot is now ready for voice/TTS.`,
            )],
        });
    },
};
