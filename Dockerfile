FROM node:22-bookworm-slim

# Set environment variables to run headlessly and safely
ENV NODE_ENV=production
ENV DISPLAY=:99

# Install system dependencies:
# - xvfb: virtual X server to render graphics
# - pulseaudio: sound server to capture audio
# - dbus-x11: allows chromium to initialize dbus correctly
# - ffmpeg: records display/audio and transcodes RTMP streams
# - chromium: headless browser
# - fonts-liberation, fonts-noto-color-emoji, fontconfig: gorgeous text rendering & emoji support
# - procps: utility commands
RUN apt-get update && apt-get install -y \
    xvfb \
    pulseaudio \
    dbus-x11 \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fontconfig \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Update the font cache to guarantee beautiful text and layout rendering
RUN fc-cache -f -v

# Configure PulseAudio for container execution (running as root)
RUN mkdir -p /var/run/dbus && \
    mkdir -p /root/.config/pulse && \
    echo "default-server = unix:/tmp/pulse-socket" > /root/.config/pulse/client.conf

# Setup application folder
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies (omit development packages)
RUN npm ci --omit=dev

# Copy application source code
COPY src/ ./src/

# Start the main orchestrator script
CMD ["node", "src/index.js"]
