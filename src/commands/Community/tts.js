import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { speakInVoice } from '../../services/tts/ttsService.js';

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
