from __future__ import annotations

import json
import re
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "0.0.0.0"
PORT = 8080
FORMAT_SELECTOR = "b[ext=mp4][vcodec!=none][acodec!=none]/b[vcodec!=none][acodec!=none]"
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


def is_youtube_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value.strip())
    except ValueError:
        return False
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return False
    return (parsed.hostname or "").lower() in YOUTUBE_HOSTS


def safe_filename(value: str, extension: str) -> str:
    name = re.sub(r"[\x00-\x1f\x7f/\\:*?\"<>|]+", " ", value or "YouTube video")
    name = re.sub(r"\s+", " ", name).strip(" .")[:140] or "YouTube video"
    ext = re.sub(r"[^a-zA-Z0-9]", "", extension or "mp4").lower() or "mp4"
    return f"{name}.{ext}"


def yt_base_args() -> list[str]:
    return [
        "yt-dlp",
        "--no-playlist",
        "--js-runtimes",
        "deno",
        "--socket-timeout",
        "15",
        "--retries",
        "2",
        "--fragment-retries",
        "2",
    ]


def get_metadata(url: str) -> dict:
    command = yt_base_args() + [
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "-f",
        FORMAT_SELECTOR,
        url,
    ]
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=45,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()
        message = detail[-1] if detail else "YouTube video could not be resolved"
        raise RuntimeError(message[:500])
    try:
        data = json.loads(result.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("YouTube metadata was invalid") from exc
    if not isinstance(data, dict):
        raise RuntimeError("YouTube metadata was invalid")
    return data


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "VexaMedia/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("vexa-media", self.address_string(), fmt % args, flush=True)

    def json_response(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.json_response(200, {"ok": True, "service": "vexa-media"})
            return
        self.json_response(404, {"error": "Not Found"})

    def do_POST(self) -> None:
        if self.path != "/download":
            self.json_response(404, {"error": "Not Found"})
            return

        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError:
            self.json_response(400, {"error": "Invalid request"})
            return
        if length <= 0 or length > 8192:
            self.json_response(400, {"error": "Invalid request"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.json_response(400, {"error": "Invalid JSON"})
            return

        url = str(payload.get("url") or "").strip()
        if not is_youtube_url(url):
            self.json_response(400, {"error": "Enter a valid YouTube link"})
            return

        try:
            metadata = get_metadata(url)
        except subprocess.TimeoutExpired:
            self.json_response(504, {"error": "YouTube took too long to respond"})
            return
        except RuntimeError as exc:
            self.json_response(422, {"error": str(exc)})
            return

        title = str(metadata.get("title") or "YouTube video")
        extension = str(metadata.get("ext") or "mp4").lower()
        filename = safe_filename(title, extension)
        content_type = "video/mp4" if extension == "mp4" else "video/webm" if extension == "webm" else "application/octet-stream"

        command = yt_base_args() + [
            "--quiet",
            "--no-warnings",
            "-f",
            FORMAT_SELECTOR,
            "-o",
            "-",
            url,
        ]

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        if process.stdout is None:
            process.kill()
            self.json_response(502, {"error": "Could not start the download"})
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header(
            "Content-Disposition",
            "attachment; filename*=UTF-8''" + urllib.parse.quote(filename, safe=""),
        )
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()

        try:
            while True:
                chunk = process.stdout.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii"))
                self.wfile.write(chunk)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            process.kill()
        finally:
            try:
                process.stdout.close()
            except Exception:
                pass
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"vexa-media listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()
