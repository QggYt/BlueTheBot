import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { leaveVoice } from '../../services/tts/ttsService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tts-stop')
        .setDescription('Stop TTS and leave the voice channel')
        .setDMPermission(false),

    async execute(interaction) {
        const stopped = leaveVoice(interaction.guildId);
        await interaction.reply({
            content: stopped
                ? '⏹️ TTS stopped and I left the voice channel.'
                : 'I am not currently speaking.',
            flags: MessageFlags.Ephemeral,
        });
    },
};
