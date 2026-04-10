"""Platform content endpoints — stats, partners, team members."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.partner import Partner
from apps.api.models.platform_stat import PlatformStat
from apps.api.models.team_member import TeamMember
from apps.api.schemas.platform_content import (
    PartnerCreate,
    PartnerResponse,
    PartnerUpdate,
    PlatformStatCreate,
    PlatformStatResponse,
    PlatformStatUpdate,
    TeamMemberCreate,
    TeamMemberResponse,
    TeamMemberUpdate,
)
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

router = APIRouter(tags=["platform-content"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stat_to_response(stat: PlatformStat) -> PlatformStatResponse:
    return PlatformStatResponse(
        id=str(stat.id),
        key=stat.key,
        value=stat.value,
        label=stat.label,
        sort_order=stat.sort_order,
    )


def _partner_to_response(partner: Partner) -> PartnerResponse:
    return PartnerResponse(
        id=str(partner.id),
        name=partner.name,
        logo_url=partner.logo_url,
        website_url=partner.website_url,
        sort_order=partner.sort_order,
    )


def _team_member_to_response(member: TeamMember) -> TeamMemberResponse:
    return TeamMemberResponse(
        id=str(member.id),
        name=member.name,
        title=member.title,
        bio=member.bio,
        photo_url=member.photo_url,
        linkedin_url=member.linkedin_url,
        sort_order=member.sort_order,
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@router.get("/platform/stats", response_model=list[PlatformStatResponse])
async def list_platform_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PlatformStatResponse]:
    """Return active platform statistics ordered by sort_order."""
    result = await db.execute(
        select(PlatformStat)
        .where(PlatformStat.is_active.is_(True))
        .order_by(PlatformStat.sort_order)
    )
    return [_stat_to_response(s) for s in result.scalars().all()]


@router.get("/platform/partners", response_model=list[PartnerResponse])
async def list_partners(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PartnerResponse]:
    """Return active partners ordered by sort_order."""
    result = await db.execute(
        select(Partner)
        .where(Partner.is_active.is_(True))
        .order_by(Partner.sort_order)
    )
    return [_partner_to_response(p) for p in result.scalars().all()]


@router.get("/platform/team", response_model=list[TeamMemberResponse])
async def list_team_members(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamMemberResponse]:
    """Return active team members ordered by sort_order."""
    result = await db.execute(
        select(TeamMember)
        .where(TeamMember.is_active.is_(True))
        .order_by(TeamMember.sort_order)
    )
    return [_team_member_to_response(m) for m in result.scalars().all()]


# ---------------------------------------------------------------------------
# Admin — Platform Stats
# ---------------------------------------------------------------------------

@router.post(
    "/admin/platform/stats",
    response_model=PlatformStatResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_platform_stat(
    request: PlatformStatCreate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformStatResponse:
    """Create a new platform stat."""
    existing = await db.execute(
        select(PlatformStat).where(PlatformStat.key == request.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "STAT_EXISTS", "message": f"Stat with key '{request.key}' already exists"},
        )
    stat = PlatformStat(
        key=request.key,
        value=request.value,
        label=request.label,
        sort_order=request.sort_order,
    )
    db.add(stat)
    await db.commit()
    await db.refresh(stat)
    return _stat_to_response(stat)


@router.put("/admin/platform/stats/{key}", response_model=PlatformStatResponse)
async def update_platform_stat(
    key: str,
    request: PlatformStatUpdate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformStatResponse:
    """Update a platform stat by key."""
    result = await db.execute(
        select(PlatformStat).where(PlatformStat.key == key)
    )
    stat = result.scalar_one_or_none()
    if not stat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAT_NOT_FOUND", "message": f"No stat with key '{key}'"},
        )
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(stat, field, value)
    await db.commit()
    await db.refresh(stat)
    return _stat_to_response(stat)


@router.delete(
    "/admin/platform/stats/{key}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_platform_stat(
    key: str,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a platform stat by key."""
    result = await db.execute(
        select(PlatformStat).where(PlatformStat.key == key)
    )
    stat = result.scalar_one_or_none()
    if not stat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAT_NOT_FOUND", "message": f"No stat with key '{key}'"},
        )
    await db.delete(stat)
    await db.commit()


# ---------------------------------------------------------------------------
# Admin — Partners
# ---------------------------------------------------------------------------

@router.post(
    "/admin/platform/partners",
    response_model=PartnerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_partner(
    request: PartnerCreate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnerResponse:
    """Create a new partner."""
    partner = Partner(
        name=request.name,
        logo_url=request.logo_url,
        website_url=request.website_url,
        sort_order=request.sort_order,
    )
    db.add(partner)
    await db.commit()
    await db.refresh(partner)
    return _partner_to_response(partner)


@router.put("/admin/platform/partners/{partner_id}", response_model=PartnerResponse)
async def update_partner(
    partner_id: UUID,
    request: PartnerUpdate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PartnerResponse:
    """Update a partner."""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "Partner not found"},
        )
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(partner, field, value)
    await db.commit()
    await db.refresh(partner)
    return _partner_to_response(partner)


@router.delete(
    "/admin/platform/partners/{partner_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_partner(
    partner_id: UUID,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a partner."""
    result = await db.execute(select(Partner).where(Partner.id == partner_id))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PARTNER_NOT_FOUND", "message": "Partner not found"},
        )
    await db.delete(partner)
    await db.commit()


# ---------------------------------------------------------------------------
# Admin — Team Members
# ---------------------------------------------------------------------------

@router.post(
    "/admin/platform/team",
    response_model=TeamMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_team_member(
    request: TeamMemberCreate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberResponse:
    """Create a new team member."""
    member = TeamMember(
        name=request.name,
        title=request.title,
        bio=request.bio,
        photo_url=request.photo_url,
        linkedin_url=request.linkedin_url,
        sort_order=request.sort_order,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return _team_member_to_response(member)


@router.put("/admin/platform/team/{member_id}", response_model=TeamMemberResponse)
async def update_team_member(
    member_id: UUID,
    request: TeamMemberUpdate,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberResponse:
    """Update a team member."""
    result = await db.execute(select(TeamMember).where(TeamMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEAM_MEMBER_NOT_FOUND", "message": "Team member not found"},
        )
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return _team_member_to_response(member)


@router.delete(
    "/admin/platform/team/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_team_member(
    member_id: UUID,
    _admin: RequireAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a team member."""
    result = await db.execute(select(TeamMember).where(TeamMember.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TEAM_MEMBER_NOT_FOUND", "message": "Team member not found"},
        )
    await db.delete(member)
    await db.commit()
