import os
import json
import asyncio
import subprocess
from typing import Dict, Any, List, Optional

def extract_video_info(url: str) -> Dict[str, Any]:
    """
    Extracts video metadata and format streams by calling yt-dlp CLI directly.
    Matches the exact working subprocess execution from Yt-downloader.
    """
    # Clean URL: Remove playlist parameters
    if 'watch?v=' in url and '&list=' in url:
        url = url.split('&list=')[0]
    if 'watch?v=' in url and '&index=' in url:
        url = url.split('&index=')[0]

    # Look for cookies.txt
    possible_cookie_paths = [
        os.path.join(os.getcwd(), 'backend', 'app', 'cookies.txt'),
        os.path.join(os.getcwd(), 'cookies.txt'),
        '/app/backend/app/cookies.txt',
        '/app/cookies.txt',
        'cookies.txt'
    ]
    
    cookie_arg = []
    for path in possible_cookie_paths:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            cookie_arg = ['--cookies', path]
            break

    # Build yt-dlp CLI command
    cmd = [
        'yt-dlp',
        '--no-warnings',
        '--skip-download',
        '-J',  # Dump JSON
        *cookie_arg,
        url
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    if result.returncode != 0:
        error_msg = result.stderr.strip() or "Failed to extract video information"
        raise Exception(error_msg)

    info = json.loads(result.stdout)
        
        # Parse formats
        formats = info.get('formats', [])
        video_streams: List[Dict[str, Any]] = []
        audio_streams: List[Dict[str, Any]] = []
        combined_streams: List[Dict[str, Any]] = []

        # Find best audio stream for client-side merging
        best_audio = None
        for f in formats:
            # Check if direct http/https url is present
            stream_url = f.get('url')
            if not stream_url:
                continue

            format_id = f.get('format_id', '')
            ext = f.get('ext', '')
            filesize = f.get('filesize') or f.get('filesize_approx')
            vcodec = f.get('vcodec', 'none')
            acodec = f.get('acodec', 'none')
            height = f.get('height')
            fps = f.get('fps')
            tbr = f.get('tbr')
            abr = f.get('abr')

            # Audio only
            if vcodec == 'none' and acodec != 'none':
                audio_entry = {
                    'format_id': format_id,
                    'ext': ext,
                    'acodec': acodec,
                    'abr': round(abr) if abr else None,
                    'filesize': filesize,
                    'url': stream_url
                }
                audio_streams.append(audio_entry)
                if not best_audio or (abr and best_audio.get('abr', 0) < abr):
                    best_audio = audio_entry

            # Video + Audio combined (e.g. 720p, 360p legacy)
            elif vcodec != 'none' and acodec != 'none' and height:
                combined_streams.append({
                    'format_id': format_id,
                    'ext': ext,
                    'resolution': f"{height}p",
                    'height': height,
                    'fps': fps,
                    'vcodec': vcodec,
                    'acodec': acodec,
                    'filesize': filesize,
                    'url': stream_url,
                    'direct_download': True
                })

            # Video only (Adaptive 1080p, 1440p, 4K, 8K)
            elif vcodec != 'none' and acodec == 'none' and height:
                video_streams.append({
                    'format_id': format_id,
                    'ext': ext,
                    'resolution': f"{height}p",
                    'height': height,
                    'fps': fps,
                    'vcodec': vcodec,
                    'filesize': filesize,
                    'url': stream_url,
                    'requires_merge': True
                })

        # Deduplicate & sort video streams (highest resolution first)
        seen_res = set()
        deduped_video_streams = []
        # Sort desc by height and fps
        video_streams.sort(key=lambda x: (x.get('height') or 0, x.get('fps') or 0), reverse=True)
        for vs in video_streams:
            res_key = f"{vs['height']}p"
            if res_key not in seen_res:
                seen_res.add(res_key)
                deduped_video_streams.append(vs)

        # Also sort combined streams
        combined_streams.sort(key=lambda x: x.get('height') or 0, reverse=True)
        audio_streams.sort(key=lambda x: x.get('abr') or 0, reverse=True)

        return {
            'id': info.get('id'),
            'title': info.get('title'),
            'description': info.get('description', '')[:300] if info.get('description') else '',
            'thumbnail': info.get('thumbnail'),
            'duration': info.get('duration'),
            'duration_string': info.get('duration_string'),
            'uploader': info.get('uploader') or info.get('channel'),
            'uploader_url': info.get('uploader_url') or info.get('channel_url'),
            'view_count': info.get('view_count'),
            'like_count': info.get('like_count'),
            'best_audio': best_audio or (audio_streams[0] if audio_streams else None),
            'video_streams': deduped_video_streams,
            'combined_streams': combined_streams,
            'audio_streams': audio_streams
        }

async def get_video_info(url: str) -> Dict[str, Any]:
    return await asyncio.to_thread(extract_video_info, url)
