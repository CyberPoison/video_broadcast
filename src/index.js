const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const url = process.env.STREAM_URL;
const width = parseInt(process.env.WIDTH || '1280', 10);
const height = parseInt(process.env.HEIGHT || '720', 10);
const fps = parseInt(process.env.FPS || '30', 10);

if (!url) {
  console.error('\x1b[31m%s\x1b[0m', '[Orchestrator] Error: STREAM_URL environment variable is required.');
  process.exit(1);
}

// Track active child processes
const processes = {};
let isStreamActive = false;

/**
 * Clean, colored terminal logging
 */
function log(prefix, color, message) {
  console.log(`${color}${prefix}\x1b[0m ${message}`);
}

/**
 * Gracefully terminate all spawned processes on exit
 */
function cleanupAndExit() {
  log('[Orchestrator]', '\x1b[35m', 'Shutting down all processes gracefully...');
  for (const name in processes) {
    if (processes[name]) {
      log('[Orchestrator]', '\x1b[35m', `Terminating ${name}...`);
      processes[name].kill('SIGKILL');
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);

// Resolve Chromium binary name dynamically depending on distribution (Ubuntu/Debian vs Alpine/others)
const chromiumBinary = fs.existsSync('/usr/bin/chromium-browser') ? 'chromium-browser' : 'chromium';

async function start() {
  log('[Orchestrator]', '\x1b[35m', 'Initializing Headless Webpage Streamer environment...');
  
  // Ensure D-Bus system daemon is running
  log('[Orchestrator]', '\x1b[35m', 'Starting D-Bus system daemon...');
  try {
    const { execSync } = require('child_process');
    fs.mkdirSync('/var/run/dbus', { recursive: true });
    execSync('dbus-uuidgen --ensure');
    execSync('dbus-daemon --system --fork');
    log('[Orchestrator]', '\x1b[32m', 'D-Bus system daemon started successfully.');
  } catch (err) {
    log('[Orchestrator]', '\x1b[31m', `D-Bus startup warning/error: ${err.message}`);
  }

  // 1. Initialize local RTMP Server
  let nms;
  try {
    const { startRtmpServer } = require('./rtmp-server');
    nms = startRtmpServer();
  } catch (err) {
    log('[Orchestrator]', '\x1b[31m', `Failed to start local RTMP server: ${err.message}`);
    process.exit(1);
  }

  // Listen to RTMP server publish events to reactively spawn/kill stream clients
  nms.on('postPublish', (id, streamPath, args) => {
    if (streamPath === '/live/webpage') {
      isStreamActive = true;
      log('[Orchestrator]', '\x1b[32m', 'RTMP Stream is active. Spawning stream clients...');
      
      if (process.env.DISCORD_TOKEN && !processes.discord) {
        spawnDiscordBot();
      }
      if (process.env.TELEGRAM_RTMP_URL && !processes.telegram) {
        spawnTelegramStreamer();
      }
    }
  });

  nms.on('donePublish', (id, streamPath, args) => {
    if (streamPath === '/live/webpage') {
      isStreamActive = false;
      log('[Orchestrator]', '\x1b[33m', 'RTMP Stream stopped. Terminating stream clients...');
      
      if (processes.discord) {
        processes.discord.kill('SIGKILL');
        processes.discord = null;
      }
      if (processes.telegram) {
        processes.telegram.kill('SIGKILL');
        processes.telegram = null;
      }
    }
  });

  // Set the DISPLAY variable so all X11 processes connect to our virtual display
  process.env.DISPLAY = ':99';
  
  // 2. Start PulseAudio Virtual Sound Driver with Virtual Null Sink
  log('[PulseAudio]', '\x1b[34m', 'Starting PulseAudio virtual sound server...');
  processes.pulseaudio = spawn('pulseaudio', [
    '--daemonize=no',
    '--exit-idle-time=-1',
    '--use-pid-file=no',
    '--system=false',
    '--log-level=warning',
    '--load=module-native-protocol-unix socket=/tmp/pulse-socket auth-anonymous=1',
    '--load=module-null-sink sink_name=virtual_speaker sink_properties=device.description=Virtual_Speaker'
  ], {
    env: { ...process.env, PULSE_ALLOW_RUN_AS_ROOT: '1' }
  });
  
  processes.pulseaudio.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) log('[PulseAudio Debug]', '\x1b[34m', msg);
  });

  // 3. Start Xvfb Virtual Framebuffer
  log('[Xvfb]', '\x1b[34m', `Creating virtual framebuffer (${width}x${height}x24) on :99...`);
  processes.xvfb = spawn('Xvfb', [
    ':99',
    '-screen', '0', `${width}x${height}x24`,
    '-ac',
    '-nolisten', 'tcp'
  ]);
  
  processes.xvfb.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) log('[Xvfb Warning]', '\x1b[34m', msg);
  });

  // Give the display server and sound server 2 seconds to warm up
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 4. Launch Chromium in kiosk fullscreen
  launchChromium();

  // Wait 4 seconds for browser to load webpage assets/JS
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // 5. Start the FFmpeg screen capture recorder
  startFFmpegRecorder();

  log('[Orchestrator]', '\x1b[35m', 'Supervisor active. Awaiting RTMP publish event to spawn stream bots...');
}

/**
 * Launches Chromium pointing to the target URL
 */
function launchChromium() {
  log('[Chromium]', '\x1b[36m', `Launching Chromium browser: ${url}`);
  
  processes.chromium = spawn(chromiumBinary, [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${width},${height}`,
    '--window-position=0,0',
    '--start-maximized',
    '--kiosk', // Launch in fullscreen kiosk mode
    `--user-data-dir=/tmp/chrome-profile-${Date.now()}`,
    url
  ], {
    env: { ...process.env, DISPLAY: ':99', PULSE_SERVER: 'unix:/tmp/pulse-socket', PULSE_SINK: 'virtual_speaker' }
  });

  processes.chromium.on('close', (code) => {
    log('[Chromium]', '\x1b[31m', `Browser process exited with code ${code}. Restarting browser in 2 seconds...`);
    setTimeout(launchChromium, 2000);
  });
}

let ffmpegLogs = [];

/**
 * Capture virtual screen and virtual audio using FFmpeg and pipe to local RTMP server
 */
function startFFmpegRecorder() {
  log('[FFmpeg Recorder]', '\x1b[32m', `Recording display :99.0 (${width}x${height} @ ${fps}fps)...`);
  
  processes.ffmpeg = spawn('ffmpeg', [
    '-f', 'x11grab',
    '-video_size', `${width}x${height}`,
    '-framerate', `${fps}`,
    '-i', ':99.0',
    '-f', 'pulse',
    '-i', 'virtual_speaker.monitor', // Capture from our virtual sound monitor
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ac', '2',
    '-ar', '44100',
    '-f', 'flv',
    'rtmp://127.0.0.1/live/webpage'
  ], {
    env: { ...process.env, PULSE_SERVER: 'unix:/tmp/pulse-socket' }
  });

  processes.ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      ffmpegLogs.push(msg);
      if (ffmpegLogs.length > 15) ffmpegLogs.shift();
    }
  });

  processes.ffmpeg.on('close', (code) => {
    log('[FFmpeg Recorder]', '\x1b[31m', `FFmpeg recorder exited with code ${code}.`);
    if (code !== 0 && ffmpegLogs.length > 0) {
      log('[FFmpeg Recorder Errors]', '\x1b[31m', '\n' + ffmpegLogs.join('\n'));
    }
    ffmpegLogs = []; // Reset logs list
    log('[FFmpeg Recorder]', '\x1b[31m', `Restarting recorder in 3 seconds...`);
    setTimeout(startFFmpegRecorder, 3000);
  });
}

/**
 * Spawns the Discord Go Live child process
 */
function spawnDiscordBot() {
  log('[Orchestrator]', '\x1b[35m', 'Spawning Discord streaming client...');
  processes.discord = spawn('node', [path.join(__dirname, 'discord-bot.js')]);
  
  processes.discord.stdout.on('data', (data) => {
    console.log(data.toString().trim());
  });
  
  processes.discord.stderr.on('data', (data) => {
    console.error(data.toString().trim());
  });

  processes.discord.on('close', (code) => {
    if (processes.discord) {
      log('[Discord Bot Manager]', '\x1b[31m', `Discord process ended (code ${code}). Re-spawning in 5 seconds...`);
      processes.discord = null;
      setTimeout(() => {
        if (isStreamActive && process.env.DISCORD_TOKEN && !processes.discord) {
          spawnDiscordBot();
        }
      }, 5000);
    }
  });
}

/**
 * Spawns the Telegram forwarder child process
 */
function spawnTelegramStreamer() {
  log('[Orchestrator]', '\x1b[35m', 'Spawning Telegram streaming client...');
  processes.telegram = spawn('node', [path.join(__dirname, 'telegram-streamer.js')]);
  
  processes.telegram.stdout.on('data', (data) => {
    console.log(data.toString().trim());
  });
  
  processes.telegram.stderr.on('data', (data) => {
    console.error(data.toString().trim());
  });

  processes.telegram.on('close', (code) => {
    if (processes.telegram) {
      log('[Telegram Manager]', '\x1b[31m', `Telegram process ended (code ${code}). Re-spawning in 5 seconds...`);
      processes.telegram = null;
      setTimeout(() => {
        if (isStreamActive && process.env.TELEGRAM_RTMP_URL && !processes.telegram) {
          spawnTelegramStreamer();
        }
      }, 5000);
    }
  });
}

// Start orchestration
start();
