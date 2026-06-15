import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from routers import ingest, analyze, export
from routers.auth import router as auth_router
from routers.subscription import router as subscription_router
from routers.reframe import router as reframe_router
from routers.explainer import router as explainer_router
from database import init_db

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "https://magnumclips.upscaledu-admin.in",
]
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)).split(",")
    if origin.strip()
]

app = FastAPI(title="MagnumClips API", version="1.0.0")

# Create DB tables on startup
init_db()

# CORS for local and deployed frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Routers
app.include_router(auth_router)
app.include_router(subscription_router)
app.include_router(ingest.router)
app.include_router(analyze.router)
app.include_router(export.router)
app.include_router(reframe_router)
app.include_router(explainer_router)

# Serve storage files (thumbnails, clips, exports)
for subdir in ["thumbnails", "clips", "exports", "raw", "explainers"]:
    dir_path = STORAGE_DIR / subdir
    dir_path.mkdir(parents=True, exist_ok=True)
    app.mount(f"/api/files/{subdir}", StaticFiles(directory=str(dir_path)), name=f"files_{subdir}")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "MagnumClips"}
