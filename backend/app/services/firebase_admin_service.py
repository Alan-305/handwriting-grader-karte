import logging
from datetime import datetime, timezone

from app.extensions import get_bucket, get_db

logger = logging.getLogger(__name__)


class FirebaseAdminService:
    @staticmethod
    def db():
        return get_db()

    @staticmethod
    def bucket():
        return get_bucket()

    def upload_bytes(self, path: str, data: bytes, content_type: str = "image/jpeg") -> str:
        bucket = self.bucket()
        if not bucket:
            logger.warning("Storage unavailable; skipping upload to %s", path)
            return path
        blob = bucket.blob(path)
        blob.upload_from_string(data, content_type=content_type)
        return path

    def download_bytes(self, path: str) -> bytes | None:
        bucket = self.bucket()
        if not bucket:
            return None
        blob = bucket.blob(path)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    def set_doc(self, collection: str, doc_id: str, data: dict, merge: bool = False):
        db = self.db()
        if not db:
            return
        data["updatedAt"] = datetime.now(timezone.utc)
        db.collection(collection).document(doc_id).set(data, merge=merge)

    def update_doc(self, collection: str, doc_id: str, data: dict):
        db = self.db()
        if not db:
            return
        data["updatedAt"] = datetime.now(timezone.utc)
        db.collection(collection).document(doc_id).update(data)

    def get_doc(self, collection: str, doc_id: str) -> dict | None:
        db = self.db()
        if not db:
            return None
        snap = db.collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def get_subcollection(self, path_parts: list[str]) -> list[dict]:
        db = self.db()
        if not db:
            return []
        ref = db
        for i, part in enumerate(path_parts):
            ref = ref.collection(part) if i % 2 == 0 else ref.document(part)
        if len(path_parts) % 2 == 0:
            ref = ref.collection(path_parts[-1]) if path_parts else ref
        docs = ref.stream() if hasattr(ref, "stream") else []
        results = []
        for doc in docs:
            item = doc.to_dict()
            item["id"] = doc.id
            results.append(item)
        return results

    def add_subdoc(self, parent_path: list[str], data: dict) -> str:
        db = self.db()
        if not db:
            return "mock-id"
        ref = db
        for i, part in enumerate(parent_path):
            if i % 2 == 0:
                ref = ref.collection(part)
            else:
                ref = ref.document(part)
        _, doc_ref = ref.add(data)
        return doc_ref.id

    def query_collection(self, collection: str, field: str, op: str, value) -> list[dict]:
        db = self.db()
        if not db:
            return []
        docs = db.collection(collection).where(field, op, value).stream()
        results = []
        for doc in docs:
            item = doc.to_dict()
            item["id"] = doc.id
            results.append(item)
        return results
