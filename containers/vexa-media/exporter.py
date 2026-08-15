import asyncio
import json
import re
from pathlib import Path

from aiohttp import web

MAX_SOURCE_BYTES = 1536 * 1024 * 1024
MAX_CUES = 5000
MAX_TEXT = 800
EXPORT_TIMEOUT = 30 * 60


def install_export_routes(app, work_dir, validate_youtube_url, run_command, extractor_args):
    work_dir = Path(work_dir)

    async def upload_source(request):
        job_id = safe_job_id(request.match_info.get("job_id"))
        path = source_path(work_dir, job_id)
        cleanup_job_files(work_dir, job_id)
        declared = int(request.headers.get("X-Vexa-Source-Size") or 0)
        if declared > MAX_SOURCE_BYTES:
            return web.json_response({"error": "Video is too large for export"}, status=413)

        written = 0
        try:
            with path.open("wb") as handle:
                async for chunk in request.content.iter_chunked(1024 * 1024):
                    written += len(chunk)
                    if written > MAX_SOURCE_BYTES:
                        raise ValueError("Video is too large for export")
                    handle.write(chunk)
        except Exception as exc:
            path.unlink(missing_ok=True)
            return web.json_response({"error": str(exc)[:300]}, status=413 if "large" in str(exc).lower() else 500)

        if written <= 0:
            path.unlink(missing_ok=True)
            return web.json_response({"error": "Video source is empty"}, status=400)
        return web.json_response({"ok": True, "size": written})

    async def prepare_youtube_source(request):
        job_id = safe_job_id(request.match_info.get("job_id"))
        cleanup_job_files(work_dir, job_id)
        body = await request.json()
        url = validate_youtube_url(body.get("url"))
        path = source_path(work_dir, job_id)
        command = [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "--js-runtimes",
            "node",
            "--extractor-args",
            extractor_args,
            "--format",
            "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]",
            "--merge-output-format",
            "mp4",
            "--remux-video",
            "mp4",
            "--output",
            str(path),
            "--print",
            "after_move:filepath",
            url,
        ]
        try:
            printed = (await run_command(*command, timeout=EXPORT_TIMEOUT)).strip().splitlines()
            final_path = Path(printed[-1].strip()) if printed else path
            if final_path.exists() and final_path != path:
                final_path.replace(path)
            if not path.exists():
                candidates = [p for p in work_dir.glob(f"{job_id}.source*") if p.is_file()]
                if candidates:
                    candidates[0].replace(path)
            if not path.exists():
                raise RuntimeError("YouTube video file was not created")
            if path.stat().st_size > MAX_SOURCE_BYTES:
                path.unlink(missing_ok=True)
                raise RuntimeError("Video is too large for export")
        except Exception as exc:
            cleanup_job_files(work_dir, job_id)
            return web.json_response({"error": str(exc)[:400]}, status=502)
        return web.json_response({"ok": True, "size": path.stat().st_size})

    async def export_video(request):
        job_id = safe_job_id(request.match_info.get("job_id"))
        source = source_path(work_dir, job_id)
        if not source.exists():
            return web.json_response({"error": "Video source is missing"}, status=404)

        try:
            body = await request.json()
            cues = normalize_cues(body.get("cues"))
            style = normalize_style(body.get("style"))
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)

        ass_path = work_dir / f"{job_id}.captions.ass"
        output = work_dir / f"{job_id}.export.mp4"
        write_ass_file(ass_path, cues, style)
        output.unlink(missing_ok=True)

        filter_value = "ass=filename=" + str(ass_path)
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vf",
            filter_value,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(output),
        ]

        try:
            await run_command(*command, timeout=EXPORT_TIMEOUT)
            if not output.exists() or output.stat().st_size <= 0:
                raise RuntimeError("Exported video file was not created")
        except Exception as exc:
            output.unlink(missing_ok=True)
            return web.json_response({"error": str(exc)[:500]}, status=502)

        response = web.FileResponse(path=output)
        response.content_type = "video/mp4"
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Vexa-Export-Size"] = str(output.stat().st_size)
        return response

    async def delete_job(request):
        job_id = safe_job_id(request.match_info.get("job_id"))
        cleanup_job_files(work_dir, job_id)
        return web.json_response({"ok": True})

    app.router.add_put("/source/{job_id}", upload_source)
    app.router.add_post("/source-youtube/{job_id}", prepare_youtube_source)
    app.router.add_post("/export/{job_id}", export_video)
    app.router.add_delete("/job/{job_id}", delete_job)


def safe_job_id(value):
    text = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", text):
        raise web.HTTPBadRequest(text=json.dumps({"error": "Invalid export job"}), content_type="application/json")
    return text


def source_path(work_dir, job_id):
    return Path(work_dir) / f"{job_id}.source.mp4"


def cleanup_job_files(work_dir, job_id):
    for path in Path(work_dir).glob(f"{job_id}.*"):
        try:
            if path.is_file():
                path.unlink(missing_ok=True)
        except OSError:
            pass


def normalize_cues(value):
    if not isinstance(value, list) or not value:
        raise ValueError("Captions are empty")
    if len(value) > MAX_CUES:
        raise ValueError("Too many caption segments")
    result = []
    for item in value:
        try:
            start = max(0.0, float(item.get("start") or 0))
            end = max(0.0, float(item.get("end") or 0))
        except Exception:
            raise ValueError("Invalid caption timing")
        text = str(item.get("text") or "").strip()[:MAX_TEXT]
        if not text or end <= start:
            raise ValueError("Invalid caption timing")
        result.append({"start": start, "end": end, "text": text})
    return result


def normalize_style(value):
    source = value if isinstance(value, dict) else {}
    return {
        "x": clamp(source.get("x"), 8, 92, 50),
        "y": clamp(source.get("y"), 10, 90, 72),
        "fontSize": clamp(source.get("fontSize"), 34, 90, 54),
        "background": bool(source.get("background")),
        "fontWeight": "regular" if str(source.get("fontWeight") or "bold") == "regular" else "bold",
        "textColor": normalize_color(source.get("textColor"), "#ffffff"),
    }


def clamp(value, low, high, fallback):
    try:
        number = float(value)
    except Exception:
        return fallback
    return max(low, min(high, number))


def normalize_color(value, fallback):
    text = str(value or "").strip().lower()
    return text if re.fullmatch(r"#[0-9a-f]{6}", text) else fallback


def write_ass_file(path, cues, style):
    x = int(round(style["x"] * 10))
    y = int(round(style["y"] * 10))
    font_size = int(round(style["fontSize"]))
    bold = -1 if style["fontWeight"] == "bold" else 0
    primary = ass_color(style["textColor"])
    border_style = 3 if style["background"] else 1
    outline = 0 if style["background"] else 3
    back = "&H98000000" if style["background"] else "&H00000000"

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1000",
        "PlayResY: 1000",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
        f"Style: Default,Noto Sans,{font_size},{primary},{primary},&H00000000,{back},{bold},0,0,0,100,100,0,0,{border_style},{outline},0,5,0,0,0,1",
        "",
        "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]
    position = f"{{\\pos({x},{y})}}"
    for cue in cues:
        lines.append(
            "Dialogue: 0," + ass_time(cue["start"]) + "," + ass_time(cue["end"]) + ",Default,,0,0,0,," + position + ass_escape(cue["text"])
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ass_time(seconds):
    total = max(0.0, float(seconds))
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    seconds_value = total % 60
    return f"{hours}:{minutes:02d}:{seconds_value:05.2f}"


def ass_escape(value):
    text = str(value or "")
    text = text.replace("\\", r"\\")
    text = text.replace("{", r"\{").replace("}", r"\}")
    text = text.replace("\r\n", r"\N").replace("\r", r"\N").replace("\n", r"\N")
    return text


def ass_color(value):
    text = normalize_color(value, "#ffffff").lstrip("#")
    red, green, blue = text[0:2], text[2:4], text[4:6]
    return "&H00" + blue.upper() + green.upper() + red.upper()
