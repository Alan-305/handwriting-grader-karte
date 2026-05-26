import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def resolve_credentials_path(raw: str) -> str:
    if not raw:
        return ""
    path = Path(raw)
    if path.is_absolute():
        return str(path)
    return str((PROJECT_ROOT / path).resolve())


class Config:
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"
    PORT = int(os.getenv("PORT", "5001"))
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]

    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "")
    GOOGLE_APPLICATION_CREDENTIALS = resolve_credentials_path(
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    )
    # Secret Manager から注入（Cloud Run --set-secrets）。ローカルは未使用で ADC / ファイル可
    FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("HGK_FIREBASE_SERVICE_ACCOUNT_JSON", "")

    # HGK_  prefix avoids collisions with shell/global ANTHROPIC_API_KEY etc.
    ANTHROPIC_API_KEY = os.getenv("HGK_ANTHROPIC_API_KEY") or os.getenv(
        "ANTHROPIC_API_KEY", ""
    )
    GEMINI_API_KEY = os.getenv("HGK_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
