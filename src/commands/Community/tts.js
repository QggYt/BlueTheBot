import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { leaveVoice, speakInVoice } from '../../services/tts/ttsService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Speak text in your current voice channel')
        .addStringOption((option) =>
            option
                .setName('text')
                .setDescription('Text for the bot to speak')
                .setRequired(true)
                .setMaxLength(1000),
        )
        .addStringOption((option) =>
            option
                .setName('language')
                .setDescription('Speech language code')
                .setRequired(false)
                .addChoices(
                    { name: 'English', value: 'en' },
                    { name: 'Arabic', value: 'ar' },
                    { name: 'Kurdish', value: 'ku' },
                    { name: 'Turkish', value: 'tr' },
                    { name: 'Spanish', value: 'es' },
                    { name: 'French', value: 'fr' },
                    { name: 'German', value: 'de' },
                ),
        ),

    async execute(interaction) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            await interaction.reply({
                content: '❌ Join a voice channel first.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const text = interaction.options.getString('text', true);
            const language = interaction.options.getString('language') || 'en';
            await speakInVoice(voiceChannel, text, language);
            await interaction.editReply('🔊 Speaking in your voice channel.');
        } catch (error) {
            await interaction.editReply(`❌ TTS failed: ${error?.message || 'Unknown error'}`);
        }
    },
};

export const ttsStop = {
    data: new SlashCommandBuilder()
        .setName('tts-stop')
        .setDescription('Stop TTS and leave the voice channel'),

    async execute(interaction) {
        const stopped = leaveVoice(interaction.guildId);
        await interaction.reply({
            content: stopped ? '⏹️ TTS stopped and I left the voice channel.' : '❌ I am not using TTS in this server.',
            flags: MessageFlags.Ephemeral,
        });
    },
};
