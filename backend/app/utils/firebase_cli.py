"""CLI スクリプト用 Firebase 初期化。"""

from pathlib import Path

from app.config import Config, resolve_credentials_path
from app.extensions import get_db, init_firebase_standalone


def bootstrap_firebase_from_env(env_path: Path | None = None) -> None:
    """プロジェクトルートの .env から Firebase Admin を初期化する。"""
    if env_path:
        from dotenv import load_dotenv

        load_dotenv(env_path)

    cred_path = resolve_credentials_path(Config.GOOGLE_APPLICATION_CREDENTIALS)
    init_firebase_standalone(
        cred_path=cred_path,
        storage_bucket=Config.FIREBASE_STORAGE_BUCKET,
        project_id=Config.FIREBASE_PROJECT_ID,
    )
    if not get_db():
        raise RuntimeError("Firebase initialization failed: Firestore client is unavailable")
