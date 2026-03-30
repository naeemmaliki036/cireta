"""File Storage Service — GCS in production, local disk in development.

Two buckets:
  - Public (images, videos, banners): direct public URLs
  - Private (whitepapers, legal docs): signed URLs with expiry

Usage:
    storage = FileStorageService()
    url = await storage.upload(data, "sales/123/banner.jpg", content_type="image/jpeg")
    url = await storage.upload_private(data, "docs/whitepaper.pdf", content_type="application/pdf")
    url = await storage.get_signed_url("docs/whitepaper.pdf")
"""

import datetime
import logging
import os
import uuid
from pathlib import Path

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

SIGNED_URL_EXPIRY_HOURS = 1

# Content types that go to private bucket
PRIVATE_CONTENT_TYPES = {"application/pdf"}


class FileStorageService:
    """Unified file storage with public + private GCS buckets and local fallback."""

    def __init__(self) -> None:
        self._backend = settings.storage_backend

    async def upload(
        self,
        file_data: bytes,
        path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload to public bucket. Returns direct public URL."""
        if self._backend == "gcs":
            return self._upload_gcs(file_data, path, content_type, private=False)
        return self._upload_local(file_data, path)

    async def upload_private(
        self,
        file_data: bytes,
        path: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload to private bucket. Returns a signed URL (1hr expiry)."""
        if self._backend == "gcs":
            self._upload_gcs(file_data, path, content_type, private=True)
            return self._get_signed_url(path)
        return self._upload_local(file_data, f"private/{path}")

    async def get_signed_url(self, path: str) -> str:
        """Get a fresh signed URL for a private file."""
        if self._backend == "gcs":
            return self._get_signed_url(path)
        return f"/uploads/private/{path}"

    async def delete(self, path: str, private: bool = False) -> None:
        """Delete a file."""
        if self._backend == "gcs":
            self._delete_gcs(path, private=private)
        else:
            sub = f"private/{path}" if private else path
            self._delete_local(sub)

    def generate_path(self, prefix: str, filename: str) -> str:
        """Generate a unique storage path preserving the file extension."""
        ext = Path(filename).suffix.lower() or ""
        unique = uuid.uuid4().hex[:12]
        safe_name = Path(filename).stem[:50].replace(" ", "_")
        return f"{prefix}/{unique}_{safe_name}{ext}"

    def is_private_content(self, content_type: str) -> bool:
        """Check if content type should go to private bucket."""
        return content_type in PRIVATE_CONTENT_TYPES

    # ── GCS Backend ──

    def _get_gcs_client(self):
        from google.cloud import storage as gcs_storage

        if settings.gcs_credentials_json:
            import json
            import tempfile

            creds = json.loads(settings.gcs_credentials_json)
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as f:
                json.dump(creds, f)
                creds_path = f.name
            client = gcs_storage.Client.from_service_account_json(creds_path)
            os.unlink(creds_path)
            return client
        elif settings.gcs_credentials_file:
            return gcs_storage.Client.from_service_account_json(
                settings.gcs_credentials_file
            )
        else:
            return gcs_storage.Client(project=settings.gcs_project_id)

    def _get_bucket_name(self, private: bool) -> str:
        if private:
            return settings.gcs_private_bucket or settings.gcs_bucket
        return settings.gcs_bucket

    def _upload_gcs(self, file_data: bytes, path: str, content_type: str, private: bool) -> str:
        client = self._get_gcs_client()
        bucket_name = self._get_bucket_name(private)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        blob.upload_from_string(file_data, content_type=content_type)
        # For public buckets, try make_public but don't fail if bucket uses uniform access
        if not private:
            try:
                blob.make_public()
            except Exception:
                pass  # Bucket-level ACL handles public access
        logger.info("Uploaded to GCS: %s/%s (private=%s)", bucket_name, path, private)
        if not private:
            return f"https://storage.googleapis.com/{bucket_name}/{path}"
        return path

    def _get_signed_url(self, path: str) -> str:
        client = self._get_gcs_client()
        bucket_name = self._get_bucket_name(private=True)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path)
        url = blob.generate_signed_url(
            expiration=datetime.timedelta(hours=SIGNED_URL_EXPIRY_HOURS),
            method="GET",
        )
        return url

    def _delete_gcs(self, path: str, private: bool = False) -> None:
        try:
            client = self._get_gcs_client()
            bucket_name = self._get_bucket_name(private)
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(path)
            blob.delete()
            logger.info("Deleted from GCS: %s/%s", bucket_name, path)
        except Exception:
            logger.warning("Failed to delete from GCS: %s", path, exc_info=True)

    # ── Local Backend ──

    def _upload_local(self, file_data: bytes, path: str) -> str:
        upload_dir = Path(settings.upload_dir)
        file_path = upload_dir / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(file_data)
        logger.info("Uploaded locally: %s", file_path)
        return f"/uploads/{path}"

    def _delete_local(self, path: str) -> None:
        file_path = Path(settings.upload_dir) / path
        if file_path.exists():
            file_path.unlink()
            logger.info("Deleted locally: %s", file_path)
