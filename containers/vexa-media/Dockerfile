FROM node:22-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    WORK_DIR=/tmp/vexa-media \
    TOKEN_TTL=6

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates git \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages \
      "yt-dlp[default]==2026.6.9" \
      "aiohttp==3.14.3" \
      "bgutil-ytdlp-pot-provider==1.3.1" \
 && git clone --depth 1 --branch 1.3.1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-ytdlp-pot-provider \
 && cd /opt/bgutil-ytdlp-pot-provider/server \
 && npm ci --no-audit --no-fund \
 && npx tsc \
 && npm prune --omit=dev --no-audit --no-fund

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 8080 4416

CMD ["sh", "-c", "node /opt/bgutil-ytdlp-pot-provider/server/build/main.js --port 4416 & sleep 1; exec python3 /app/server.py"]
