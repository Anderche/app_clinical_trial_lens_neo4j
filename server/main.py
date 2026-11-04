"""Production server: the Vite bundle plus precomputed JSON, no database.

    uvicorn server.main:app --port 8000

/api/details/{id} is a thin file read today; swap its body for a live Neo4j
query later without touching the frontend.
"""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(os.environ.get("STATIC_DIR", ROOT / "web" / "dist"))
DATA_DIR = STATIC_DIR / "data"
NODE_ID = re.compile(r"^(chembl|drug|tgt|cond):[A-Za-z0-9_.-]{1,64}$")

app = FastAPI(title="Clinical Trial Lens", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):          # content-hashed by Vite
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.endswith(".json") or path.startswith("/api/details/"):
        response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@app.get("/api/health")
def health():
    meta_file = DATA_DIR / "meta.json"
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    return {"status": "ok", "buildDate": meta.get("buildDate"), "source": meta.get("source")}


@app.get("/api/details/{node_id}")
def details(node_id: str):
    if not NODE_ID.match(node_id):           # also blocks path traversal
        raise HTTPException(400, "invalid node id")
    path = DATA_DIR / "details" / f"{node_id.replace(':', '_')}.json"
    if not path.is_file():
        raise HTTPException(404, "unknown node")
    return JSONResponse(json.loads(path.read_text()))


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
