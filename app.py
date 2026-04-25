from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_backend_app():
    spec = importlib.util.spec_from_file_location("backend_app", BACKEND_DIR / "app.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load backend app")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_backend_app = _load_backend_app()
app = _backend_app.app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)