FROM node:22-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    WORK_DIR=/tmp/vexa-media

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]==2026.6.9" "aiohttp==3.14.3"

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 8080

CMD ["python3", "/app/server.py"]
