import asyncio
import base64
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlparse

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

PORT = int(os.environ.get("PORT", "8080"))
WORK_DIR = Path(os.environ.get("WORK_DIR", "/tmp/vexa-media"))
WORK_DIR.mkdir(parents=True, exist_ok=True)
SESSION_TTL = 60 * 60
MAX_HEIGHT = 720
YT_DLP_TIMEOUT = 75
DOWNLOAD_TIMEOUT = 20 * 60
ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}

sessions = {}


def now():
    return int(time.time())


def cleanup():
    cutoff = now() - SESSION_TTL
    stale = [key for key, value in sessions.items() if int(value.get("created", 0)) < cutoff]
    for key in stale:
        sessions.pop(key, None)
    for path in WORK_DIR.glob("*"):
        try:
            if path.is_file() and int(path.stat().st_mtime) < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            pass


def validate_youtube_url(value):
    raw = str(value or "").strip()
    if not raw or len(raw) > 2048:
        raise web.HTTPBadRequest(text=json.dumps({"error": "Paste a valid YouTube link"}), content_type="application/json")
    try:
        parsed = urlparse(raw)
    except Exception:
        parsed = None
    if not parsed or parsed.scheme not in {"https", "http"} or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise web.HTTPBadRequest(text=json.dumps({"error": "Paste a valid YouTube link"}), content_type="application/json")
    return raw


async def run_command(*args, timeout=YT_DLP_TIMEOUT):
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("YouTube request timed out")
    if proc.returncode != 0:
        message = stderr.decode("utf-8", "replace").strip().splitlines()
        detail = message[-1] if message else "YouTube import failed"
        raise RuntimeError(detail[:600])
    return stdout.decode("utf-8", "replace")


def safe_headers(value):
    result = {}
    if not isinstance(value, dict):
        return result
    for key, val in value.items():
        name = str(key or "").strip()
        text = str(val or "").strip()
        if not name or not text:
            continue
        if name.lower() in {"host", "content-length", "connection", "accept-encoding"}:
            continue
        result[name] = text
    return result


def score_muxed(fmt):
    ext = str(fmt.get("ext") or "")
    vcodec = str(fmt.get("vcodec") or "none")
    acodec = str(fmt.get("acodec") or "none")
    height = int(fmt.get("height") or 0)
    protocol = str(fmt.get("protocol") or "")
    if vcodec == "none" or acodec == "none" or not fmt.get("url"):
        return None
    if height and height > MAX_HEIGHT:
        return None
    if "m3u8" in protocol:
        return None
    return (
        1 if ext == "mp4" else 0,
        1 if vcodec.startswith("avc1") else 0,
        1 if acodec.startswith("mp4a") else 0,
        height,
        float(fmt.get("tbr") or 0),
    )


def score_audio(fmt):
    vcodec = str(fmt.get("vcodec") or "none")
    acodec = str(fmt.get("acodec") or "none")
    ext = str(fmt.get("ext") or "")
    protocol = str(fmt.get("protocol") or "")
    if vcodec != "none" or acodec == "none" or not fmt.get("url"):
        return None
    if "m3u8" in protocol:
        return None
    return (
        1 if ext in {"m4a", "mp4"} else 0,
        1 if acodec.startswith("mp4a") else 0,
        float(fmt.get("abr") or fmt.get("tbr") or 0),
    )


def choose_format(formats, scorer):
    candidates = []
    for fmt in formats if isinstance(formats, list) else []:
        score = scorer(fmt)
        if score is not None:
            candidates.append((score, fmt))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


async def extract_info(url):
    output = await run_command(
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--js-runtimes",
        "node",
        "--dump-single-json",
        url,
    )
    data = json.loads(output)
    if data.get("_type") == "playlist":
        entries = data.get("entries") or []
        data = entries[0] if entries else {}
    formats = data.get("formats") or []
    video = choose_format(formats, score_muxed)
    audio = choose_format(formats, score_audio)
    if not video:
        raise RuntimeError("No browser-playable YouTube stream was found")
    if not audio:
        audio = video
    return {
        "title": str(data.get("title") or "YouTube video")[:240],
        "duration": float(data.get("duration") or 0),
        "thumbnail": str(data.get("thumbnail") or "")[:2048],
        "webpage_url": str(data.get("webpage_url") or url)[:2048],
        "video_url": str(video.get("url") or ""),
        "video_headers": safe_headers(video.get("http_headers") or data.get("http_headers")),
        "video_type": "video/mp4" if str(video.get("ext") or "") == "mp4" else "video/webm",
        "audio_url": str(audio.get("url") or ""),
        "audio_headers": safe_headers(audio.get("http_headers") or data.get("http_headers")),
    }


async def health(_request):
    return web.json_response({"ok": True})


async def prepare(request):
    cleanup()
    body = await request.json()
    url = validate_youtube_url(body.get("url"))
    try:
        info = await extract_info(url)
    except Exception as exc:
        return web.json_response({"error": str(exc)[:400]}, status=502)
    job_id = secrets.token_urlsafe(18)
    sessions[job_id] = {**info, "created": now()}
    return web.json_response({
        "jobId": job_id,
        "title": info["title"],
        "duration": info["duration"],
        "thumbnail": info["thumbnail"],
    })


def download_output_path(job_id):
    return WORK_DIR / f"{job_id}.mp4"


async def download(request):
    cleanup()
    body = await request.json()
    url = validate_youtube_url(body.get("url"))
    job_id = secrets.token_urlsafe(14)
    output = download_output_path(job_id)
    template = str(WORK_DIR / f"{job_id}.%(ext)s")
    command = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--js-runtimes",
        "node",
        "--format",
        "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]",
        "--merge-output-format",
        "mp4",
        "--remux-video",
        "mp4",
        "--output",
        template,
        "--print",
        "after_move:filepath",
        url,
    ]
    try:
        printed = (await run_command(*command, timeout=DOWNLOAD_TIMEOUT)).strip().splitlines()
        final_path = Path(printed[-1].strip()) if printed else output
        if not final_path.exists():
            candidates = list(WORK_DIR.glob(f"{job_id}.*"))
            final_path = candidates[0] if candidates else output
        if not final_path.exists():
            raise RuntimeError("Downloaded video file was not created")
    except Exception as exc:
        for path in WORK_DIR.glob(f"{job_id}.*"):
            path.unlink(missing_ok=True)
        return web.json_response({"error": str(exc)[:400]}, status=502)

    title = "YouTube video"
    try:
        metadata = await extract_info(url)
        title = metadata["title"]
    except Exception:
        pass

    response = web.FileResponse(path=final_path)
    response.content_type = "video/mp4"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Vexa-Title"] = base64.urlsafe_b64encode(title.encode("utf-8")).decode("ascii").rstrip("=")
    return response


async def proxy_media(request):
    cleanup()
    job_id = request.match_info.get("job_id", "")
    info = sessions.get(job_id)
    if not info or now() - int(info.get("created", 0)) > SESSION_TTL:
        raise web.HTTPNotFound(text="Media session expired")

    headers = dict(info.get("video_headers") or {})
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    timeout = ClientTimeout(total=None, sock_connect=20, sock_read=90)
    session = ClientSession(timeout=timeout)
    upstream = None
    try:
        upstream = await session.request(
            request.method,
            info["video_url"],
            headers=headers,
            allow_redirects=True,
        )
        passthrough = {}
        for name in ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]:
            if name in upstream.headers:
                passthrough[name] = upstream.headers[name]
        passthrough["Cache-Control"] = "no-store"

        response = web.StreamResponse(status=upstream.status, headers=passthrough)
        await response.prepare(request)
        if request.method != "HEAD":
            async for chunk in upstream.content.iter_chunked(128 * 1024):
                await response.write(chunk)
        await response.write_eof()
        return response
    finally:
        if upstream is not None:
            try:
                upstream.release()
            except Exception:
                pass
        await session.close()


def ffmpeg_headers(headers):
    lines = []
    for key, value in (headers or {}).items():
        if key.lower() in {"host", "content-length", "range"}:
            continue
        text = str(value).replace("\r", "").replace("\n", "")
        lines.append(f"{key}: {text}")
    return "\r\n".join(lines) + ("\r\n" if lines else "")


async def live(request):
    cleanup()
    job_id = request.match_info.get("job_id", "")
    info = sessions.get(job_id)
    if not info or now() - int(info.get("created", 0)) > SESSION_TTL:
        raise web.HTTPNotFound(text="Media session expired")

    client_ws = web.WebSocketResponse(heartbeat=20, max_msg_size=64 * 1024)
    await client_ws.prepare(request)

    first = await client_ws.receive(timeout=20)
    if first.type != WSMsgType.TEXT:
        await client_ws.close(code=1008, message=b"Missing live session data")
        return client_ws

    try:
        config = json.loads(first.data)
        scribe_token = str(config.get("scribeToken") or "").strip()
        language = str(config.get("sourceLanguage") or "").strip().lower()
        start_time = max(0.0, float(config.get("startTime") or 0))
    except Exception:
        scribe_token = ""
        language = ""
        start_time = 0.0

    if not scribe_token or not re.fullmatch(r"[a-z]{2,3}", language):
        await client_ws.close(code=1008, message=b"Invalid live session data")
        return client_ws

    params = {
        "model_id": "scribe_v2_realtime",
        "token": scribe_token,
        "audio_format": "pcm_16000",
        "language_code": language,
        "commit_strategy": "vad",
        "vad_threshold": "0.4",
        "vad_silence_threshold_secs": "0.65",
        "min_speech_duration_ms": "100",
        "min_silence_duration_ms": "100",
        "no_verbatim": "true",
    }

    ffmpeg_cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-re",
        "-ss",
        f"{start_time:.3f}",
    ]
    header_blob = ffmpeg_headers(info.get("audio_headers"))
    if header_blob:
        ffmpeg_cmd.extend(["-headers", header_blob])
    ffmpeg_cmd.extend([
        "-i",
        info["audio_url"],
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        "pipe:1",
    ])

    ffmpeg = await asyncio.create_subprocess_exec(
        *ffmpeg_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    timeout = ClientTimeout(total=None, sock_connect=20, sock_read=None)
    http = ClientSession(timeout=timeout)
    try:
        scribe_ws = await http.ws_connect(
            "wss://api.elevenlabs.io/v1/speech-to-text/realtime",
            params=params,
            heartbeat=20,
            max_msg_size=2 * 1024 * 1024,
        )
    except Exception as exc:
        ffmpeg.kill()
        await ffmpeg.wait()
        await http.close()
        await client_ws.send_json({"message_type": "error", "message": f"Could not connect live captions: {exc}"})
        await client_ws.close()
        return client_ws

    async def feed_audio():
        try:
            while True:
                chunk = await ffmpeg.stdout.read(6400)
                if not chunk:
                    break
                await scribe_ws.send_json({
                    "message_type": "input_audio_chunk",
                    "audio_base_64": base64.b64encode(chunk).decode("ascii"),
                })
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def relay_scribe():
        async for message in scribe_ws:
            if message.type == WSMsgType.TEXT:
                await client_ws.send_str(message.data)
            elif message.type in {WSMsgType.ERROR, WSMsgType.CLOSED, WSMsgType.CLOSE}:
                break

    async def watch_client():
        async for message in client_ws:
            if message.type in {WSMsgType.ERROR, WSMsgType.CLOSED, WSMsgType.CLOSE}:
                break

    tasks = [
        asyncio.create_task(feed_audio()),
        asyncio.create_task(relay_scribe()),
        asyncio.create_task(watch_client()),
    ]
    _done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)

    try:
        await scribe_ws.close()
    except Exception:
        pass
    try:
        if ffmpeg.returncode is None:
            ffmpeg.kill()
        await ffmpeg.wait()
    except Exception:
        pass
    await http.close()
    if not client_ws.closed:
        await client_ws.close()
    return client_ws


app = web.Application(client_max_size=1024 * 1024)
app.router.add_get("/health", health)
app.router.add_post("/prepare", prepare)
app.router.add_post("/download", download)
app.router.add_route("GET", "/media/{job_id}", proxy_media)
app.router.add_route("HEAD", "/media/{job_id}", proxy_media)
app.router.add_get("/live/{job_id}", live)

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=PORT, access_log=None)
