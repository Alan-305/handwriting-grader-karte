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

    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(
            cred,
            {
                "storageBucket": app.config["FIREBASE_STORAGE_BUCKET"],
                "projectId": app.config["FIREBASE_PROJECT_ID"],
            },
        )
    else:
        firebase_admin.initialize_app(
            options={
                "storageBucket": app.config["FIREBASE_STORAGE_BUCKET"],
                "projectId": app.config["FIREBASE_PROJECT_ID"],
            }
        )
    _db = firestore.client()
    _bucket = storage.bucket()


def get_db():
    return _db


def get_bucket():
    return _bucket
