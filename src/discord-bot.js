// Expose global WebSocket for compatibility with @dank074/discord-video-stream in Node.js
global.WebSocket = require('ws');

const { Client } = require('discord.js-selfbot-v13');
const { Streamer, prepareStream, playStream } = require('@dank074/discord-video-stream');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const channelId = process.env.DISCORD_CHANNEL_ID;
const width = parseInt(process.env.WIDTH || '1280', 10);
const height = parseInt(process.env.HEIGHT || '720', 10);
const fps = parseInt(process.env.FPS || '30', 10);

if (!token || !guildId || !channelId) {
  console.error('\x1b[31m%s\x1b[0m', '[Discord Bot] Error: DISCORD_TOKEN, DISCORD_GUILD_ID, and DISCORD_CHANNEL_ID must all be set.');
  process.exit(1);
}

// Instantiate client with patched voice support (mandatory for video streaming)
const client = new Client({
  patchVoice: true
});

const streamer = new Streamer(client);

client.on('ready', async () => {
  console.log('\x1b[36m%s\x1b[0m', `[Discord Bot] Authenticated as Discord User: ${client.user.tag}`);
  
  try {
    console.log('\x1b[36m%s\x1b[0m', `[Discord Bot] Joining Voice Channel: ${channelId} (Guild: ${guildId})...`);
    
    // Join the Voice / Video channel
    await streamer.joinVoice(guildId, channelId);
    console.log('\x1b[32m%s\x1b[0m', `[Discord Bot] Joined voice channel successfully!`);
    
    const rtmpUrl = 'rtmp://127.0.0.1/live/webpage';
    console.log('\x1b[36m%s\x1b[0m', `[Discord Bot] Opening local stream ${rtmpUrl}...`);
    
    // Prepare the video and audio transcoding pipeline
    const { command, output } = prepareStream(rtmpUrl, {
      width,
      height,
      fps,
      bitrateVideo: 3000,
      bitrateVideoMax: 4500,
      includeAudio: true
    });
    
    console.log('\x1b[36m%s\x1b[0m', `[Discord Bot] Starting Go Live screen sharing...`);
    
    // Play the stream to the Voice channel
    await playStream(output, streamer, { type: 'go-live' });
    console.log('\x1b[32m%s\x1b[0m', `[Discord Bot] Broadcast is now LIVE in the voice channel!`);
    
  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', `[Discord Bot] Streaming encountered a fatal error: ${err.message}`);
    process.exit(1);
  }
});

client.on('error', (err) => {
  console.error('\x1b[31m%s\x1b[0m', `[Discord Bot] Client Error: ${err.message}`);
});

console.log('\x1b[36m%s\x1b[0m', '[Discord Bot] Connecting to Discord Gateway...');
client.login(token).catch(err => {
  console.error('\x1b[31m%s\x1b[0m', `[Discord Bot] Failed to log in: ${err.message}`);
  process.exit(1);
});
