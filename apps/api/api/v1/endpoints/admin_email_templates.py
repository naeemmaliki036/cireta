"""Admin email template management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.email_template import EmailTemplate
from apps.api.services.email_service import (
    DEFAULT_TEMPLATES,
    TEMPLATE_VARIABLES,
    EmailService,
)
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["admin"])


# --- Schemas ---


class EmailTemplateResponse(BaseModel):
    key: str
    subject: str
    html_body: str
    description: str | None = None
    is_active: bool = True
    variables: list[str] = []
    updated_at: str | None = None
    is_custom: bool = False


class EmailTemplateUpdateRequest(BaseModel):
    subject: str | None = Field(None, min_length=10, max_length=255)
    html_body: str | None = Field(None, min_length=100)


class EmailTemplatePreviewRequest(BaseModel):
    to_email: EmailStr


# --- Helpers ---


async def _get_email_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EmailService:
    return EmailService(db)


# --- Endpoints ---


@router.get("/email-templates", response_model=list[EmailTemplateResponse])
async def list_email_templates(
    _admin_id: RequireAdmin,
    svc: Annotated[EmailService, Depends(_get_email_service)],
) -> list[dict]:
    """List all email templates (DB overrides merged with defaults)."""
    return await svc.get_all_templates()


@router.get("/email-templates/{key}", response_model=EmailTemplateResponse)
async def get_email_template(
    key: str,
    _admin_id: RequireAdmin,
    svc: Annotated[EmailService, Depends(_get_email_service)],
) -> dict:
    """Get a single email template by key."""
    tmpl = await svc.get_template_by_key(key)
    if not tmpl:
        raise HTTPException(status_code=404, detail={
            "code": "TEMPLATE_NOT_FOUND",
            "message": f"Email template '{key}' not found",
        })
    return tmpl


@router.patch("/email-templates/{key}", response_model=EmailTemplateResponse)
async def update_email_template(
    key: str,
    body: EmailTemplateUpdateRequest,
    _admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Update an email template subject/html_body.

    Creates a DB row if only a default exists. Validates non-empty fields.
    """
    if key not in DEFAULT_TEMPLATES:
        # Check if it exists in DB
        result = await db.execute(
            select(EmailTemplate).where(EmailTemplate.key == key)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail={
                "code": "TEMPLATE_NOT_FOUND",
                "message": f"Email template '{key}' not found",
            })

    if body.subject is None and body.html_body is None:
        raise HTTPException(status_code=422, detail={
            "code": "VALIDATION_ERROR",
            "message": "At least one of subject or html_body must be provided",
        })

    # Upsert: load existing DB row or create new one from default
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.key == key)
    )
    tmpl = result.scalar_one_or_none()

    if tmpl is None:
        default = DEFAULT_TEMPLATES[key]
        tmpl = EmailTemplate()
        tmpl.key = key
        tmpl.subject = default["subject"]
        tmpl.html_body = default["html_body"]
        tmpl.description = default.get("description")
        db.add(tmpl)

    if body.subject is not None:
        tmpl.subject = body.subject
    if body.html_body is not None:
        tmpl.html_body = body.html_body

    await db.commit()
    await db.refresh(tmpl)

    return {
        "key": tmpl.key,
        "subject": tmpl.subject,
        "html_body": tmpl.html_body,
        "description": tmpl.description,
        "is_active": tmpl.is_active,
        "variables": TEMPLATE_VARIABLES.get(tmpl.key, []),
        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
        "is_custom": True,
    }


@router.patch("/email-templates/{key}/toggle", response_model=EmailTemplateResponse)
async def toggle_email_template(
    key: str,
    _admin_id: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Toggle is_active for an email template.

    Creates a DB row from default if needed (toggled to inactive).
    """
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.key == key)
    )
    tmpl = result.scalar_one_or_none()

    if tmpl is None:
        default = DEFAULT_TEMPLATES.get(key)
        if not default:
            raise HTTPException(status_code=404, detail={
                "code": "TEMPLATE_NOT_FOUND",
                "message": f"Email template '{key}' not found",
            })
        tmpl = EmailTemplate()
        tmpl.key = key
        tmpl.subject = default["subject"]
        tmpl.html_body = default["html_body"]
        tmpl.description = default.get("description")
        tmpl.is_active = False  # toggle from default True to False
        db.add(tmpl)
    else:
        tmpl.is_active = not tmpl.is_active

    await db.commit()
    await db.refresh(tmpl)

    return {
        "key": tmpl.key,
        "subject": tmpl.subject,
        "html_body": tmpl.html_body,
        "description": tmpl.description,
        "is_active": tmpl.is_active,
        "variables": TEMPLATE_VARIABLES.get(tmpl.key, []),
        "updated_at": tmpl.updated_at.isoformat() if tmpl.updated_at else None,
        "is_custom": True,
    }


@router.post("/email-templates/{key}/preview")
async def preview_email_template(
    key: str,
    body: EmailTemplatePreviewRequest,
    _admin_id: RequireAdmin,
    svc: Annotated[EmailService, Depends(_get_email_service)],
) -> dict:
    """Send a preview email with sample variables to the given address."""
    tmpl = await svc.get_template_by_key(key)
    if not tmpl:
        raise HTTPException(status_code=404, detail={
            "code": "TEMPLATE_NOT_FOUND",
            "message": f"Email template '{key}' not found",
        })

    # Build sample variables
    sample_vars: dict[str, str] = {}
    for var in TEMPLATE_VARIABLES.get(key, []):
        sample_vars[var] = _sample_value(var)

    result = await svc.send(key, body.to_email, sample_vars)
    return {"status": "ok", "email_result": result}


@router.post("/email-templates/{key}/reset")
async def reset_email_template(
    key: str,
    _admin_id: RequireAdmin,
    svc: Annotated[EmailService, Depends(_get_email_service)],
) -> dict:
    """Delete the DB override so the template falls back to default."""
    if key not in DEFAULT_TEMPLATES:
        raise HTTPException(status_code=404, detail={
            "code": "TEMPLATE_NOT_FOUND",
            "message": f"No default template exists for '{key}'",
        })

    deleted = await svc.reset_template(key)
    return {
        "status": "reset" if deleted else "already_default",
        "key": key,
    }


def _sample_value(var_name: str) -> str:
    """Return a sample value for preview emails."""
    samples: dict[str, str] = {
        "code": "123456",
        "display_name": "Jane Doe",
        "token_name": "Cireta Gold Token",
        "token_symbol": "CGT",
        "amount": "1,000",
        "tokens_allocated": "100",
        "tokens_amount": "100",
        "days_left": "30",
        "wallet_address": "0x1234...abcd",
        "dividend_amount": "50.00",
        "issuer_name": "Acme Mining Corp",
        "issuer_email": "issuer@example.com",
        "sale_name": "Gold Token Series A",
        "rejection_reason": "Incomplete documentation",
        "frontend_url": "https://launchpad.cireta.com",
        "admin_url": "https://admin.cireta.com",
    }
    return samples.get(var_name, f"[{var_name}]")
