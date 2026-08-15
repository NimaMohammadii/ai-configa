from aiohttp import web

import server
from exporter import install_export_routes

install_export_routes(
    server.app,
    server.WORK_DIR,
    server.validate_youtube_url,
    server.run_command,
    server.YOUTUBE_EXTRACTOR_ARGS,
)

if __name__ == "__main__":
    web.run_app(server.app, host="0.0.0.0", port=server.PORT, access_log=None)
