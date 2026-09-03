import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
} from '@discordjs/voice';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const connections = new Map();

function findTtsBinary() {
  return process.env.TTS_BINARY || 'espeak-ng';
}

async function synthesize(text, outputFile) {
  const binary = findTtsBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-w', outputFile, text], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => reject(new Error(`TTS engine is unavailable (${binary}). Install espeak-ng or set TTS_BINARY. ${error.message}`)));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`TTS engine exited with code ${code}: ${stderr.trim() || 'unknown error'}`));
    });
  });
}

function stopGuildTts(guildId) {
  const state = connections.get(guildId);
  if (!state) return false;
  try { state.player.stop(true); } catch {}
  try { state.connection.destroy(); } catch {}
  connections.delete(guildId);
  return true;
}

export default [
  {
    data: new SlashCommandBuilder()
      .setName('tts')
      .setDescription('Speak text in your current voice channel')
      .setDMPermission(false)
      .addStringOption(option => option
        .setName('text')
        .setDescription('Text to speak')
        .setRequired(true)
        .setMaxLength(500)),
    async execute(interaction) {
      const channel = interaction.member?.voice?.channel;
      if (!channel) {
        return interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
      }
      if (!channel.joinable || !channel.speakable) {
        return interaction.reply({ content: 'I cannot join or speak in that voice channel. Check my permissions.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const text = interaction.options.getString('text', true);
      const guildId = interaction.guildId;

      try {
        stopGuildTts(guildId);
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

        const player = createAudioPlayer({ behavior: NoSubscriberBehavior.Stop });
        connection.subscribe(player);
        connections.set(guildId, { connection, player });

        const dir = await mkdtemp(join(tmpdir(), 'bluethebott-ts-'));
        const audioFile = join(dir, 'speech.wav');
        try {
          await synthesize(text, audioFile);
          const resource = createAudioResource(createReadStream(audioFile), { inputType: StreamType.Arbitrary });
          player.play(resource);
          await entersState(player, AudioPlayerStatus.Playing, 5_000);
          await interaction.editReply('🔊 Speaking in your voice channel.');
          player.once(AudioPlayerStatus.Idle, async () => {
            await rm(dir, { recursive: true, force: true }).catch(() => {});
          });
        } catch (error) {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
          stopGuildTts(guildId);
          throw error;
        }
      } catch (error) {
        await interaction.editReply(`❌ TTS failed: ${error.message}`);
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('tts-stop')
      .setDescription('Stop TTS and leave the voice channel')
      .setDMPermission(false),
    async execute(interaction) {
      const stopped = stopGuildTts(interaction.guildId);
      await interaction.reply({
        content: stopped ? '⏹️ TTS stopped and I left the voice channel.' : 'I am not currently speaking.',
        ephemeral: true,
      });
    },
  },
];
