from pathlib import Path
import os

from flask import Flask, send_from_directory

from routes.chat import chat_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.register_blueprint(chat_bp)
    frontend_root = Path(__file__).resolve().parent.parent

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    @app.get("/")
    def serve_root():
        return send_from_directory(frontend_root, "splash.html")

    @app.get("/<path:filename>")
    def serve_frontend_files(filename: str):
        return send_from_directory(frontend_root, filename)

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
