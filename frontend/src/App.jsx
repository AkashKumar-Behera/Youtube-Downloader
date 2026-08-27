import React, { useState } from 'react';
import { 
  Play, 
  Download, 
  Sparkles, 
  Music, 
  Video, 
  Eye, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Film,
  Zap
} from 'lucide-react';
import { mergeVideoAndAudioClientSide, convertAudioClientSide, fetchStreamWithProgress, triggerBrowserDownload } from './utils/ffmpegService';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('video'); // 'video' or 'audio'

  // Processing state for Progress Modal
  const [processing, setProcessing] = useState(false);
  const [processState, setProcessState] = useState({ step: '', progress: 0, text: '' });

  const handleFetchInfo = async (e) => {
    e?.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setVideoData(null);

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || 'Failed to extract video information. Please check the URL.');
      }

      setVideoData(json.data);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDownload = async (streamUrl, filename) => {
    setProcessing(true);
    setProcessState({ step: 'downloading', progress: 0, text: 'Starting instant direct download...' });

    try {
      const data = await fetchStreamWithProgress(streamUrl, filename, (p) => {
        setProcessState({ step: 'downloading', progress: p, text: `Downloading ${filename}: ${p}%` });
      });

      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      triggerBrowserDownload(blob, filename);
      setProcessState({ step: 'done', progress: 100, text: 'Download completed successfully!' });
      setTimeout(() => setProcessing(false), 2000);
    } catch (err) {
      setProcessState({ step: 'error', progress: 0, text: `Error: ${err.message}` });
      setTimeout(() => setProcessing(false), 3500);
    }
  };

  const handleMergeDownload = async (format) => {
    if (!videoData?.best_audio) {
      setError('Audio stream unavailable for this video');
      return;
    }

    setProcessing(true);
    try {
      await mergeVideoAndAudioClientSide(
        format.url,
        videoData.best_audio.url,
        `${videoData.title}_${format.resolution}`,
        (state) => setProcessState(state)
      );
      setTimeout(() => setProcessing(false), 2500);
    } catch (err) {
      console.error(err);
      setProcessState({ step: 'error', progress: 0, text: `Merge Error: ${err.message}` });
      setTimeout(() => setProcessing(false), 4000);
    }
  };

  const handleAudioDownload = async (audioStream, asMp3 = true) => {
    setProcessing(true);
    try {
      if (asMp3) {
        await convertAudioClientSide(
          audioStream.url,
          videoData.title,
          (state) => setProcessState(state)
        );
      } else {
        await handleDirectDownload(audioStream.url, `${videoData.title}.m4a`);
      }
      setTimeout(() => setProcessing(false), 2500);
    } catch (err) {
      setProcessState({ step: 'error', progress: 0, text: `Audio Error: ${err.message}` });
      setTimeout(() => setProcessing(false), 4000);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo-wrap">
          <div className="logo-icon">
            <Play fill="white" size={20} color="white" />
          </div>
          <span className="logo-text">StreamVault</span>
        </div>
        <span className="badge-low-ram">
          <Zap size={13} style={{ display: 'inline', marginRight: 4 }} />
          Zero Server RAM Mode
        </span>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">
          Download YouTube Videos in <span>Full Ultra HD & MP3</span>
        </h1>
        <p className="hero-desc">
          Supercharged with client-side WebAssembly rendering. Unlimited downloads, 0 server delays, and instant high-speed proxying.
        </p>
      </section>

      {/* URL Input Bar */}
      <form className="search-card" onSubmit={handleFetchInfo}>
        <div className="input-wrapper">
          <Film size={20} color="#8b949e" />
          <input
            type="text"
            placeholder="Paste YouTube Video / Shorts / Playlist URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
        </div>
        <button type="submit" className="btn-fetch" disabled={loading || !url.trim()}>
          {loading ? (
            <>
              <Loader2 size={18} className="spinning" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Fetch Video</span>
            </>
          )}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div style={{
          background: 'rgba(255, 30, 66, 0.1)',
          border: '1px solid rgba(255, 30, 66, 0.3)',
          color: '#ff5252',
          padding: '14px 20px',
          borderRadius: 12,
          marginBottom: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: 760,
          width: '100%'
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Video Preview & Options */}
      {videoData && (
        <div className="video-card">
          <div className="video-info-grid">
            <div className="thumbnail-container">
              <img src={videoData.thumbnail} alt={videoData.title} className="thumbnail-img" />
              {videoData.duration_string && (
                <span className="duration-pill">{videoData.duration_string}</span>
              )}
            </div>

            <div className="video-meta">
              <div>
                <h2 className="video-title">{videoData.title}</h2>
                <div className="video-author-row">
                  <span>By <strong>{videoData.uploader || 'YouTube Channel'}</strong></span>
                </div>
              </div>

              <div className="stats-badges">
                {videoData.view_count && (
                  <div className="stat-chip">
                    <Eye size={14} color="#8b949e" />
                    <span>{Number(videoData.view_count).toLocaleString()} views</span>
                  </div>
                )}
                {videoData.duration && (
                  <div className="stat-chip">
                    <Clock size={14} color="#8b949e" />
                    <span>{Math.floor(videoData.duration / 60)} mins</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Formats Selection */}
          <div className="format-section">
            <div className="tab-nav">
              <button 
                className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
                onClick={() => setActiveTab('video')}
              >
                <Video size={18} />
                Video Qualities ({(videoData.video_streams?.length || 0) + (videoData.combined_streams?.length || 0)})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
                onClick={() => setActiveTab('audio')}
              >
                <Music size={18} />
                Audio & MP3 ({videoData.audio_streams?.length || 0})
              </button>
            </div>

            {activeTab === 'video' && (
              <div className="format-grid">
                {/* 1. Combined Direct Streams (720p / 360p) */}
                {videoData.combined_streams?.map((fmt, idx) => (
                  <div key={`comb-${idx}`} className="format-card">
                    <div>
                      <div className="format-badge badge-green">Direct MP4</div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                        {fmt.resolution} {fmt.fps ? `${fmt.fps}fps` : ''}
                      </h3>
                      <p style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                        Instant Single-Click Download
                      </p>
                    </div>
                    <button 
                      className="btn-download-action"
                      onClick={() => handleDirectDownload(fmt.url, `${videoData.title}_${fmt.resolution}.mp4`)}
                    >
                      <Download size={16} />
                      Download {fmt.resolution}
                    </button>
                  </div>
                ))}

                {/* 2. Ultra HD Adaptive Streams (1080p, 1440p, 4K, 8K) */}
                {videoData.video_streams?.map((fmt, idx) => (
                  <div key={`hd-${idx}`} className="format-card">
                    <div>
                      <div className="format-badge">
                        {fmt.height >= 2160 ? '4K Ultra HD' : fmt.height >= 1080 ? 'Full HD' : 'HD Ready'}
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                        {fmt.resolution} {fmt.fps ? `${fmt.fps}fps` : ''}
                      </h3>
                      <p style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                        WASM In-Browser Merge
                      </p>
                    </div>
                    <button 
                      className="btn-download-action"
                      onClick={() => handleMergeDownload(fmt)}
                    >
                      <Download size={16} />
                      Merge & Save {fmt.resolution}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="format-grid">
                {/* MP3 High Definition Option */}
                {videoData.best_audio && (
                  <div className="format-card" style={{ borderColor: 'rgba(255, 30, 66, 0.4)' }}>
                    <div>
                      <div className="format-badge">MP3 Audio</div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                        320 kbps (HQ)
                      </h3>
                      <p style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                        Converted to standard MP3
                      </p>
                    </div>
                    <button 
                      className="btn-download-action"
                      onClick={() => handleAudioDownload(videoData.best_audio, true)}
                    >
                      <Music size={16} />
                      Download MP3
                    </button>
                  </div>
                )}

                {/* M4A Raw Tracks */}
                {videoData.audio_streams?.map((fmt, idx) => (
                  <div key={`aud-${idx}`} className="format-card">
                    <div>
                      <div className="format-badge badge-green">M4A Original</div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                        {fmt.abr ? `${fmt.abr} kbps` : 'Audio Track'}
                      </h3>
                      <p style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                        Lossless original stream
                      </p>
                    </div>
                    <button 
                      className="btn-download-action"
                      onClick={() => handleAudioDownload(fmt, false)}
                    >
                      <Download size={16} />
                      Download M4A
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Client Processing Modal */}
      {processing && (
        <div className="modal-overlay">
          <div className="modal-content">
            {processState.step === 'done' ? (
              <CheckCircle2 size={48} color="#00e676" style={{ margin: '0 auto 16px' }} />
            ) : processState.step === 'error' ? (
              <AlertCircle size={48} color="#ff1e42" style={{ margin: '0 auto 16px' }} />
            ) : (
              <Loader2 size={48} color="#ff1e42" className="spinning" style={{ margin: '0 auto 16px' }} />
            )}

            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
              {processState.step === 'done' ? 'Ready!' : 'Processing Media'}
            </h3>
            
            <p style={{ color: '#8b949e', fontSize: 14 }}>
              {processState.text}
            </p>

            <div className="progress-track">
              <div 
                className="progress-fill" 
                style={{ width: `${Math.max(5, processState.progress)}%` }} 
              />
            </div>

            <div style={{ fontSize: 12, color: '#6e7681', marginTop: 8 }}>
              Running safely in your browser (0% VPS memory load)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
