const { spawn } = require('child_process');
require('dotenv').config();

const telegramUrl = process.env.TELEGRAM_RTMP_URL;

if (!telegramUrl) {
  console.error('\x1b[31m%s\x1b[0m', '[Telegram Streamer] Error: TELEGRAM_RTMP_URL is not set.');
  process.exit(1);
}

/**
 * Spawns an FFmpeg process to copy the local RTMP stream to Telegram's RTMPS ingest.
 * Since we use '-c copy', there is no video transcoding, meaning CPU usage is virtually zero.
 */
function startForwarding() {
  console.log('\x1b[36m%s\x1b[0m', `[Telegram Streamer] Forwarding local RTMP stream to Telegram...`);
  
  // FFmpeg arguments:
  // -re: Read input at native frame rate (essential for RTMP inputs)
  // -i: Input source (our local RTMP server loop)
  // -c copy: Copy both video and audio streams directly (no re-encoding)
  // -f flv: Output format required by RTMP/RTMPS
  const args = [
    '-re',
    '-i', 'rtmp://127.0.0.1/live/webpage',
    '-c', 'copy',
    '-f', 'flv',
    telegramUrl
  ];
  
  const ffmpegProcess = spawn('ffmpeg', args);
  
  ffmpegProcess.stderr.on('data', (data) => {
    const log = data.toString().trim();
    // If you need to debug the raw FFmpeg output, uncomment the line below:
    // console.log(`[Telegram Streamer FFmpeg] ${log}`);
  });
  
  ffmpegProcess.on('close', (code) => {
    console.warn('\x1b[33m%s\x1b[0m', `[Telegram Streamer] FFmpeg forwarder exited with code ${code}. Reconnecting in 5 seconds...`);
    setTimeout(startForwarding, 5000);
  });
  
  ffmpegProcess.on('error', (err) => {
    console.error('\x1b[31m%s\x1b[0m', `[Telegram Streamer] Failed to spawn FFmpeg process: ${err.message}`);
  });
}

startForwarding();
