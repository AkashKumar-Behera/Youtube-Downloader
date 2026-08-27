import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

let ffmpegInstance = null;
let isLoaded = false;

/**
 * Initializes and loads FFmpeg.wasm in the browser worker
 */
export async function getFFmpeg(onProgressCallback) {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();
  
  ffmpeg.on('progress', ({ progress }) => {
    if (onProgressCallback) {
      onProgressCallback(Math.round(progress * 100));
    }
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  isLoaded = true;
  return ffmpegInstance;
}

/**
 * Downloads a stream in chunks via backend proxy and reports download progress
 */
export async function fetchStreamWithProgress(streamUrl, filename, onProgress) {
  const proxyUrl = `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(filename)}`;
  const response = await fetch(proxyUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch media stream (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  const reader = response.body.getReader();
  let receivedLength = 0;
  let chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
    if (total > 0 && onProgress) {
      onProgress(Math.round((receivedLength / total) * 100));
    }
  }

  // Combine chunks into Uint8Array
  let allChunks = new Uint8Array(receivedLength);
  let position = 0;
  for (let chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  return allChunks;
}

/**
 * Merges separate video and audio streams client-side in browser WebWorker via FFmpeg.wasm
 */
export async function mergeVideoAndAudioClientSide(videoUrl, audioUrl, title, onStepUpdate) {
  onStepUpdate({ step: 'video_download', progress: 0, text: 'Fetching high-res video stream...' });
  const videoData = await fetchStreamWithProgress(videoUrl, 'input_video.mp4', (p) => {
    onStepUpdate({ step: 'video_download', progress: p, text: `Downloading video stream: ${p}%` });
  });

  onStepUpdate({ step: 'audio_download', progress: 0, text: 'Fetching high-quality audio stream...' });
  const audioData = await fetchStreamWithProgress(audioUrl, 'input_audio.m4a', (p) => {
    onStepUpdate({ step: 'audio_download', progress: p, text: `Downloading audio stream: ${p}%` });
  });

  onStepUpdate({ step: 'loading_wasm', progress: 0, text: 'Preparing In-Browser Merging Engine (WASM)...' });
  const ffmpeg = await getFFmpeg((progress) => {
    onStepUpdate({ step: 'merging', progress, text: `Merging video & audio in browser: ${progress}%` });
  });

  onStepUpdate({ step: 'merging', progress: 10, text: 'Writing streams to browser memory...' });
  await ffmpeg.writeFile('input_video.mp4', videoData);
  await ffmpeg.writeFile('input_audio.m4a', audioData);

  onStepUpdate({ step: 'merging', progress: 30, text: 'Fast-muxing video and audio tracks...' });
  // Copy codecs directly for instant lightning merge (no re-encoding needed for mp4/m4a)
  await ffmpeg.exec([
    '-i', 'input_video.mp4',
    '-i', 'input_audio.m4a',
    '-c', 'copy',
    '-movflags', '+faststart',
    'output.mp4'
  ]);

  const outputData = await ffmpeg.readFile('output.mp4');
  
  // Cleanup virtual files
  await ffmpeg.deleteFile('input_video.mp4');
  await ffmpeg.deleteFile('input_audio.m4a');
  await ffmpeg.deleteFile('output.mp4');

  // Trigger browser download
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
  triggerBrowserDownload(blob, `${sanitizeFilename(title)}.mp4`);
  
  onStepUpdate({ step: 'done', progress: 100, text: 'Download completed!' });
}

/**
 * Converts audio stream into MP3 in browser
 */
export async function convertAudioClientSide(audioUrl, title, onStepUpdate) {
  onStepUpdate({ step: 'audio_download', progress: 0, text: 'Fetching raw audio stream...' });
  const audioData = await fetchStreamWithProgress(audioUrl, 'input_audio.m4a', (p) => {
    onStepUpdate({ step: 'audio_download', progress: p, text: `Downloading audio: ${p}%` });
  });

  onStepUpdate({ step: 'loading_wasm', progress: 0, text: 'Loading Audio Converter Engine...' });
  const ffmpeg = await getFFmpeg((progress) => {
    onStepUpdate({ step: 'converting', progress, text: `Converting to 320kbps MP3: ${progress}%` });
  });

  await ffmpeg.writeFile('raw_audio.m4a', audioData);

  onStepUpdate({ step: 'converting', progress: 20, text: 'Encoding high-definition MP3...' });
  await ffmpeg.exec([
    '-i', 'raw_audio.m4a',
    '-vn',
    '-b:a', '320k',
    'output.mp3'
  ]);

  const outputData = await ffmpeg.readFile('output.mp3');
  await ffmpeg.deleteFile('raw_audio.m4a');
  await ffmpeg.deleteFile('output.mp3');

  const blob = new Blob([outputData.buffer], { type: 'audio/mp3' });
  triggerBrowserDownload(blob, `${sanitizeFilename(title)}.mp3`);
  
  onStepUpdate({ step: 'done', progress: 100, text: 'Audio downloaded!' });
}

export function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function sanitizeFilename(name) {
  return (name || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim();
}
