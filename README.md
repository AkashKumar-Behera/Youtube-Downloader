# 🎬 StreamVault - Ultra-Low RAM YouTube Downloader (Dockerized)

A sleek, modern YouTube Downloader Web App with **zero server-side RAM overload**. Streams and formats are resolved by a lightweight Python FastAPI backend, while 1080p/4K video-audio merging and MP3 conversions are performed **client-side directly inside the user's browser via WebAssembly (FFmpeg.wasm)**.

---

## 🚀 Features

- **Ultra-Low Memory Footprint**: Uses only **~50MB - 80MB RAM** on your VPS.
- **Client-Side WASM Merging**: 1080p, 1440p, 4K video + audio streams are merged in the browser using the user's device CPU/RAM, keeping the server completely free.
- **Direct 720p / 360p / M4A**: Instant 1-click downloads.
- **MP3 Converter**: High-quality 320kbps MP3 encoding in the browser.
- **High Speed Proxy Pipe**: 64KB chunk-by-chunk streaming proxy that prevents CORS blocks without saving large video files to the server disk.
- **Glassmorphism UI**: Beautiful dark UI with animated gradients and responsive layouts.

---

## 🐳 Running with Docker (Recommended for VPS)

### 1. Single Command Run
```bash
docker compose up -d --build
```

The app will start on port `8000`. Access it at:
```
http://your-vps-ip:8000
```

### 2. Check Resource / RAM Usage
```bash
docker stats yt-downloader
```
*(Notice memory stays under ~60MB even during multi-user 4K downloads!)*

---

## 💻 Local Development Setup

### Backend (Python FastAPI)
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.
