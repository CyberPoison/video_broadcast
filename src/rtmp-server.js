const NodeMediaServer = require('node-media-server');

/**
 * Starts the local RTMP server on port 1935.
 * This server receives the high-quality stream from FFmpeg and serves it to Discord and Telegram.
 */
function startRtmpServer() {
  const config = {
    rtmp: {
      port: 1935,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    },
    // We disable the HTTP server to conserve resources.
    // If you need HTTP-FLV or WebSocket-FLV playback, you can add an 'http' config block here.
    logType: 2 // Log level: 0 - silent, 1 - error, 2 - warning, 3 - info. Kept at 2 to avoid console spam.
  };

  const nms = new NodeMediaServer(config);
  
  nms.run();
  
  console.log('\x1b[32m%s\x1b[0m', '[RTMP Server] Local RTMP server initialized successfully on rtmp://127.0.0.1:1935');
  
  return nms;
}

// Allow running the module directly for testing
if (require.main === module) {
  startRtmpServer();
}

module.exports = { startRtmpServer };
