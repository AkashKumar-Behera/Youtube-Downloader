import os
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
import httpx
from .services.ytdl import get_video_info

app = FastAPI(
    title="YouTube Downloader API",
    description="Ultra-low memory YouTube streaming & metadata backend",
    version="1.0.0"
)

# Enable CORS and Cross-Origin Headers for WebAssembly (SharedArrayBuffer)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_coop_coep_headers(request: Request, call_next):
    """
    Required security headers for FFmpeg.wasm multi-threading (SharedArrayBuffer)
    """
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    return response

class InfoRequest(BaseModel):
    url: str

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Youtube Downloader API"}

@app.post("/api/info")
async def fetch_info(req: InfoRequest):
    try:
        if not req.url or not req.url.strip():
            raise HTTPException(status_code=400, detail="URL cannot be empty")
        
        info = await get_video_info(req.url.strip())
        return {"success": True, "data": info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/proxy-stream")
async def proxy_stream(
    url: str = Query(..., description="Direct media stream URL"),
    filename: str = Query("download.mp4", description="Suggested filename for download")
):
    """
    Ultra-low RAM streaming proxy.
    Streams 64KB chunks directly to the client browser without saving on disk or accumulating in memory.
    """
    try:
        # Standard desktop user agent to avoid throttling
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity;q=1, *;q=0",
            "Range": "bytes=0-"
        }

        client = httpx.AsyncClient(follow_redirects=True, timeout=None)
        req = client.build_request("GET", url, headers=headers)
        res = await client.send(req, stream=True)

        if res.status_code >= 400:
            await client.aclose()
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch media stream from source")

        async def stream_generator():
            try:
                async for chunk in res.aiter_bytes(chunk_size=64 * 1024):
                    if chunk:
                        yield chunk
            finally:
                await res.aclose()
                await client.aclose()

        response_headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition"
        }
        
        if "content-length" in res.headers:
            response_headers["Content-Length"] = res.headers["content-length"]
        if "content-type" in res.headers:
            response_headers["Content-Type"] = res.headers["content-type"]
        else:
            response_headers["Content-Type"] = "application/octet-stream"

        return StreamingResponse(
            stream_generator(),
            headers=response_headers,
            status_code=res.status_code
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming proxy error: {str(e)}")

# Mount static files if frontend is built
dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(dist_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_dir, "index.html"))
