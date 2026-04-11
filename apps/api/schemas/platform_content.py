"""Schemas for platform stats, partners, and team members."""

from pydantic import BaseModel

# --- Platform Stats ---

class PlatformStatResponse(BaseModel):
    id: str
    key: str
    value: str
    label: str
    sort_order: int


class PlatformStatCreate(BaseModel):
    key: str
    value: str
    label: str
    sort_order: int = 0


class PlatformStatUpdate(BaseModel):
    value: str | None = None
    label: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# --- Partners ---

class PartnerResponse(BaseModel):
    id: str
    name: str
    logo_url: str | None
    website_url: str | None
    sort_order: int


class PartnerCreate(BaseModel):
    name: str
    logo_url: str | None = None
    website_url: str | None = None
    sort_order: int = 0


class PartnerUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    website_url: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# --- Team Members ---

class TeamMemberResponse(BaseModel):
    id: str
    name: str
    title: str
    bio: str | None
    photo_url: str | None
    linkedin_url: str | None
    sort_order: int


class TeamMemberCreate(BaseModel):
    name: str
    title: str
    bio: str | None = None
    photo_url: str | None = None
    linkedin_url: str | None = None
    sort_order: int = 0


class TeamMemberUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    linkedin_url: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
