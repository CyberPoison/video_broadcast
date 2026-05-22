# 📺 Headless Webpage Streamer (OBS-in-a-Box)

A premium, fully-containerized, headless streaming solution designed to capture any interactive webpage, dashboard, or canvas—including full video and synchronized audio—and broadcast it live to **Telegram Channels/Groups** and/or **Discord Voice Channels** in real-time.

---

## ⚙️ Architecture

```
                                  [ HEADLESS CONTAINER ]
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│  ┌───────────────┐        ┌─────────────┐                                               │
│  │   Chromium    │───────>│    Xvfb     │ (Virtual Display Screen)                      │
│  │   (Browser)   │        │  (Display)  │                                               │
│  └───────────────┘        └──────┬──────┘                                               │
│                                  │                                                      │
│  ┌───────────────┐               │                                                      │
│  │  Webpage Audio│───────>┌──────▼──────┐                                               │
│  │ (PulseAudio)  │        │   FFmpeg    │ (Encodes H264 & AAC)                          │
│  └───────────────┘        │  (Recorder) │                                               │
│                           └──────┬──────┘                                               │
│                                  │                                                      │
│                                  ▼                                                      │
│                      ┌──────────────────────┐                                           │
│                      │  Local RTMP Server   │ (node-media-server)                       │
│                      │  rtmp://127.0.0.1/   │                                           │
│                      └──────────┬───────────┘                                           │
│                                 │                                                       │
│                ┌────────────────┴────────────────┐                                      │
│                ▼                                 ▼                                      │
│     ┌─────────────────────┐           ┌─────────────────────┐                           │
│     │  Telegram Streamer  │           │   Discord Bot       │                           │
│     │   (FFmpeg Copy)     │           │ (WebRTC Transceiver)│                           │
│     └──────────┬──────────┘           └──────────┬──────────┘                           │
└────────────────┼─────────────────────────────────┼──────────────────────────────────────┘
                 │                                 │
                 ▼                                 ▼
         [ Telegram RTMPS ]               [ Discord Voice Channel ]
        (Public Live Stream)                 (Go-Live Screen Share)
```

---

## ✨ Features

*   **OBS Without a GUI**: Captures web pages dynamically at `30` or `60` FPS, rendering animations, charts, and maps smoothly.
*   **Virtual Audio Capture**: PulseAudio virtual drivers capture sound played by the webpage (such as alert sound effects or background video audio) and stream it perfectly in-sync with the video.
*   **Zero-Overhead Telegram Streaming**: Automatically pipes the local stream directly to Telegram's RTMPS ingest using FFmpeg stream copy (`-c copy`), resulting in virtually **0% CPU** overhead for the forwarder.
*   **Discord Go-Live Bot**: Joins a target voice channel and utilizes Discord's proprietary UDP/RTP protocol (via WebRTC) to stream the video as high-quality "Go Live" screen sharing.
*   **Container Stability**: 
    *   **Auto-Restart**: Centralized Node.js orchestration script supervises processes, auto-recovering Chromium, FFmpeg, or Discord/Telegram bots instantly if they crash.
    *   **Shared Memory Optimization**: Explicitly allocates a large shared memory pool (`shm_size: 2gb` in Docker Compose) to prevent Chromium crash states on asset-heavy pages.
    *   **Standard Rendering Fonts**: Integrates standard Western rendering fonts (`fonts-liberation`) and extensive emoji support (`fonts-noto-color-emoji`) to ensure your webpage and emojis look exactly as intended without empty squares ("tofu").

---

## 🛠️ Configuration (.env)

Duplicate `.env.example` to `.env` and configure the following parameters:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `STREAM_URL` | **Yes** | - | The HTTP/HTTPS web address of the dashboard or page you want to capture. |
| `WIDTH` | No | `1280` | Capture screen width resolution. |
| `HEIGHT` | No | `720` | Capture screen height resolution. |
| `FPS` | No | `30` | Stream frame rate (recommended `30` or `60`). |
| `TELEGRAM_RTMP_URL` | No | - | Telegram RTMPS destination URL. If set, Telegram stream is activated. |
| `DISCORD_TOKEN` | No | - | Discord **User Account Token** (required for voice channel streaming). |
| `DISCORD_GUILD_ID` | No | - | Discord Guild (Server) ID. |
| `DISCORD_CHANNEL_ID` | No | - | Discord Voice Channel ID. |

---

## 🚀 Getting Started

### Prerequisites
*   Docker & Docker Compose installed on your system.

### Quick Start with Docker Compose

1.  **Configure environment variables**:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file in your favorite editor and configure your variables (see guides below for Discord & Telegram details).

2.  **Build and run the container**:
    ```bash
    docker compose up -d --build
    ```

3.  **Monitor live logs**:
    ```bash
    docker compose logs -f
    ```

4.  **Stop streaming**:
    ```bash
    docker compose down
    ```

---

## 📖 Practical Guides

### 📱 Stream to Telegram

Telegram channels and groups support high-quality live-streaming via standard RTMP/RTMPS protocols.

1.  Open your **Telegram Channel** or **Telegram Group** where you are an administrator.
2.  Click the Channel/Group header -> Click the `Stream With...` or `Start Live Stream` button.
3.  Choose **Stream with other tools** (RTMP).
4.  Copy the **Server URL** (e.g. `rtmps://dc5-1.rtmp.t.me/s/`) and the **Stream Key** (e.g. `12345678:abcdefg...`).
5.  Combine them into a single URL in your `.env`:
    ```env
    TELEGRAM_RTMP_URL=rtmps://dc5-1.rtmp.t.me/s/12345678:abcdefg...
    ```
6.  Start the container. Your webpage will immediately be piped into the Telegram live stream dashboard, where you can click **Start Live Stream** to broadcast it to all subscribers.

---

### 💬 Stream to Discord Voice Channels

To stream video to a voice channel, a Discord bot must connect and simulate a standard client webcam or screen share. Because Discord's official application bot API does not support video streaming, this requires a **Discord User Account Token** (self-bot).

#### ⚠️ Essential Warning
> [!WARNING]
> Automating user account tokens (self-bots) is a violation of the Discord Terms of Service. Using it may result in account termination. **Always use an alternative/throwaway Discord account** specifically created for this streaming service.

#### How to Extract your Discord User Token
1.  Log in to Discord via your web browser (e.g. Chrome, Firefox) using the alt-account.
2.  Press `F12` or `Ctrl+Shift+I` (`Cmd+Option+I` on Mac) to open **Developer Tools**.
3.  Navigate to the **Network** tab.
4.  Interact with Discord (e.g. send a test message or switch servers) to generate API requests.
5.  In the Network filter box, type `/api/v9` or `science`.
6.  Click on any of the listed network requests and check the **Headers** tab.
7.  Locate the **Request Headers** section and find the **`Authorization`** header.
8.  Copy the value of the authorization header (a long string of characters without "Bot" prefix). This is your user token.
9.  Add the token and target channel information to your `.env`:
    ```env
    DISCORD_TOKEN=NzU4...YOUR_USER_TOKEN_HERE...
    DISCORD_GUILD_ID=123456789012345678  # Server ID
    DISCORD_CHANNEL_ID=987654321098765432 # Voice Channel ID
    ```

---

## 🛠️ Local Development (Non-Docker)

To run the orchestrator script directly on a local Linux development environment:

1.  Install packages:
    ```bash
    sudo apt install -y xvfb pulseaudio chromium-browser ffmpeg
    npm install
    ```
2.  Run the system:
    ```bash
    npm start
    ```
# video_broadcast
