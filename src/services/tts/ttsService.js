import {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
} from '@discordjs/voice';
import { Readable } from 'node:stream';

const connections = new Map();

// TTS feature is independently implemented for TitanBot.
// The reference Discord-TTS/Bot project is AGPL-3.0; this file does not copy its source.

function getGoogleTtsUrl(text, language) {
    const query = encodeURIComponent(text);
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${query}&tl=${encodeURIComponent(language)}&client=tw-ob`;
}

function splitText(text, maxLength = 180) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const parts = [];
    let current = '';

    for (const word of clean.split(' ')) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxLength && current) {
            parts.push(current);
            current = word;
        } else {
            current = next;
        }
    }
    if (current) parts.push(current);
    return parts;
}

async function fetchAudio(text, language) {
    const response = await fetch(getGoogleTtsUrl(text, language), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`TTS provider returned HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('TTS provider returned empty audio');
    return bytes;
}

function getOrCreateGuildState(guildId, voiceChannel) {
    let state = connections.get(guildId);
    if (state) return state;

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
    });

    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
    });

    connection.subscribe(player);
    state = { connection, player };
    connections.set(guildId, state);

    connection.on(VoiceConnectionStatus.Disconnected, () => {
        connections.delete(guildId);
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
        connections.delete(guildId);
    });

    return state;
}

async function playBuffer(player, buffer) {
    const resource = createAudioResource(Readable.from(buffer), {
        inputType: StreamType.MP3,
        inlineVolume: false,
    });

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 5_000);
    await entersState(player, AudioPlayerStatus.Idle, 120_000);
}

export async function speakInVoice(voiceChannel, text, language = 'en') {
    if (!voiceChannel?.isVoiceBased?.()) throw new Error('You must be in a voice channel.');
    const parts = splitText(text);
    if (!parts.length) throw new Error('TTS text cannot be empty.');

    const state = getOrCreateGuildState(voiceChannel.guild.id, voiceChannel);
    await entersState(state.connection, VoiceConnectionStatus.Ready, 15_000);

    for (const part of parts) {
        const buffer = await fetchAudio(part, language);
        await playBuffer(state.player, buffer);
    }
}

export function leaveVoice(guildId) {
    const state = connections.get(guildId);
    if (!state) return false;
    state.player.stop(true);
    state.connection.destroy();
    connections.delete(guildId);
    return true;
}
