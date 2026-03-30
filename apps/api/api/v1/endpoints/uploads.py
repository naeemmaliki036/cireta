"""File upload endpoint — auto-routes to public or private bucket."""

from fastapi import APIRouter, HTTPException, UploadFile, status

from apps.api.services.file_storage_service import FileStorageService
from packages.common.core.auth_deps import CurrentUserId

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_DOC_TYPES = {"application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("")
async def upload_file(
    file: UploadFile,
    _user_id: CurrentUserId,
    prefix: str = "general",
) -> dict:
    """Upload a file. Images go to public bucket, PDFs to private.

    Returns url (public direct or signed), path, content_type, size, private flag.
    """
    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MISSING_CONTENT_TYPE", "message": "File content type required"},
        )

    all_allowed = ALLOWED_IMAGE_TYPES | ALLOWED_DOC_TYPES
    if file.content_type not in all_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"Allowed types: {', '.join(sorted(all_allowed))}",
            },
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FILE_TOO_LARGE", "message": "Maximum file size is 10 MB"},
        )

    storage = FileStorageService()
    path = storage.generate_path(prefix, file.filename or "upload")
    is_private = storage.is_private_content(file.content_type)

    if is_private:
        url = await storage.upload_private(data, path, content_type=file.content_type)
    else:
        url = await storage.upload(data, path, content_type=file.content_type)

    return {
        "url": url,
        "path": path,
        "content_type": file.content_type,
        "size": len(data),
        "private": is_private,
    }


@router.get("/signed-url")
async def get_signed_url(
    path: str,
    _user_id: CurrentUserId,
) -> dict:
    """Get a fresh signed URL for a private file (e.g., whitepapers)."""
    storage = FileStorageService()
    url = await storage.get_signed_url(path)
    return {"url": url, "path": path}
