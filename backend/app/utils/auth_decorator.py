import os
from functools import wraps

from flask import g, jsonify, request

_firebase_auth_available = False

try:
    from firebase_admin import auth as firebase_auth

    _firebase_auth_available = True
except ImportError:
    firebase_auth = None


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "認証が必要です"}), 401

        token = auth_header.split("Bearer ", 1)[1]

        if _firebase_auth_available and os.getenv("FIREBASE_PROJECT_ID"):
            try:
                decoded = firebase_auth.verify_id_token(token)
                g.teacher_id = decoded["uid"]
                g.teacher_email = decoded.get("email", "")
            except Exception:
                return jsonify({"error": "無効なトークンです"}), 401
        else:
            g.teacher_id = request.headers.get("X-Dev-Teacher-Id", "dev-teacher")
            g.teacher_email = "dev@local"

        return f(*args, **kwargs)

    return decorated
