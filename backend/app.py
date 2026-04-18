from pathlib import Path
import os

from flask import Flask, redirect, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from routes.chat import chat_bp
from storage.qa_store import init_db


def create_app() -> Flask:
    app = Flask(__name__)
    init_db()
    app.register_blueprint(chat_bp)
    frontend_root = Path(__file__).resolve().parent.parent
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    is_production = app_env in {"prod", "production"}
    force_https = os.getenv("FORCE_HTTPS", "true").strip().lower() == "true"

    # Make scheme/host reliable behind reverse proxies (Render/Railway/Fly/Nginx, etc.)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # type: ignore[assignment]

    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=is_production,
    )

    cors_raw = os.getenv("CORS_ALLOW_ORIGIN", "*")
    cors_origins = {origin.strip() for origin in cors_raw.split(",") if origin.strip()}
    if not cors_origins:
        cors_origins = {"*"}

    @app.before_request
    def enforce_https():
        if not (is_production and force_https):
            return None

        forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
        is_https = request.is_secure or forwarded_proto == "https"
        if is_https:
            return None

        https_url = request.url.replace("http://", "https://", 1)
        return redirect(https_url, code=301)

    @app.after_request
    def add_cors_headers(response):
        request_origin = request.headers.get("Origin", "")
        allow_all = "*" in cors_origins

        if allow_all:
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif request_origin and request_origin in cors_origins:
            response.headers["Access-Control-Allow-Origin"] = request_origin
            response.headers["Vary"] = "Origin"

        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"

        # Security headers for production readiness.
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers[
            "Content-Security-Policy"
        ] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: http:;"

        if is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Ensure UI updates are visible immediately and avoid stale assets in dev.
        path = request.path.lower()
        if path == "/" or path.endswith((".html", ".css", ".js")):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

        return response

    @app.get("/health")
    def health_check():
        return {"status": "ok"}

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
