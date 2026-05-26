import logging
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage
from flask_cors import CORS

logger = logging.getLogger(__name__)

cors = CORS()
_db = None
_bucket = None


def init_firebase(app):
    global _db, _bucket
    if firebase_admin._apps:
        _db = firestore.client()
        _bucket = storage.bucket()
        return

    cred_path = app.config.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and not Path(cred_path).is_file():
        logger.warning(
            "Firebase credentials not found at %s — API starts in limited mode "
            "(health OK; upload/grading need serviceAccountKey.json in project root).",
            cred_path,
        )
        return

    _init_firebase_app(cred_path, app.config["FIREBASE_STORAGE_BUCKET"], app.config["FIREBASE_PROJECT_ID"])


def init_firebase_standalone(*, cred_path: str, storage_bucket: str, project_id: str):
    """Flask 外（import CLI 等）から Firebase Admin を初期化する。"""
    global _db, _bucket
    if firebase_admin._apps:
        _db = firestore.client()
        _bucket = storage.bucket()
        return _db
    if not cred_path or not Path(cred_path).is_file():
        raise RuntimeError(
            f"Firebase credentials not found: {cred_path or '(not set)'}. "
            "Set GOOGLE_APPLICATION_CREDENTIALS in .env"
        )
    if not project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is not set in .env")
    _init_firebase_app(cred_path, storage_bucket, project_id)
    return _db


def _init_firebase_app(cred_path: str | None, storage_bucket: str, project_id: str):
    global _db, _bucket
    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(
            cred,
            {
                "storageBucket": storage_bucket,
                "projectId": project_id,
            },
        )
    else:
        firebase_admin.initialize_app(
            options={
                "storageBucket": storage_bucket,
                "projectId": project_id,
            }
        )
    _db = firestore.client()
    _bucket = storage.bucket()


def get_db():
    return _db


def get_bucket():
    return _bucket
