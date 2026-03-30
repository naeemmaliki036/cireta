"""Sale content endpoints — team members, FAQs, images, documents."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.sale_document import SaleDocument
from apps.api.models.sale_faq import SaleFAQ
from apps.api.models.sale_image import SaleImage
from apps.api.models.sale_team_member import SaleTeamMember
from apps.api.models.token_sale import TokenSale
from packages.common.core.auth_deps import CurrentUserId
from packages.common.db.session import get_db

router = APIRouter(prefix="/sales/{sale_id}", tags=["sale-content"])


# --- Schemas ---

class TeamMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    title: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    sort_order: int = 0

class TeamMemberResponse(BaseModel):
    id: str
    name: str
    title: str | None
    bio: str | None
    photo_url: str | None
    sort_order: int

class FAQCreate(BaseModel):
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)
    sort_order: int = 0

class FAQResponse(BaseModel):
    id: str
    question: str
    answer: str
    sort_order: int

class ImageCreate(BaseModel):
    url: str = Field(..., min_length=1, max_length=500)
    caption: str | None = None
    is_banner: bool = False
    sort_order: int = 0

class ImageResponse(BaseModel):
    id: str
    url: str
    caption: str | None
    is_banner: bool
    sort_order: int

class DocumentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    doc_type: str = "other"
    url: str | None = None
    ipfs_hash: str | None = None

class DocumentResponse(BaseModel):
    id: str
    name: str
    doc_type: str
    url: str | None
    ipfs_hash: str | None


# --- Helpers ---

async def _get_sale_with_auth(
    sale_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> TokenSale:
    """Get sale and verify caller is the issuer."""
    result = await db.execute(
        select(TokenSale)
        .options(selectinload(TokenSale.issuer))
        .where(TokenSale.id == sale_id)
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"})
    if sale.issuer.user_id != user_id:
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"})
    return sale


# --- Team Members ---

@router.get("/team", response_model=list[TeamMemberResponse])
async def list_team_members(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamMemberResponse]:
    result = await db.execute(
        select(SaleTeamMember).where(SaleTeamMember.sale_id == sale_id).order_by(SaleTeamMember.sort_order)
    )
    return [TeamMemberResponse(id=str(m.id), name=m.name, title=m.title, bio=m.bio, photo_url=m.photo_url, sort_order=m.sort_order) for m in result.scalars().all()]

@router.post("/team", response_model=TeamMemberResponse, status_code=201)
async def add_team_member(
    sale_id: UUID,
    data: TeamMemberCreate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberResponse:
    await _get_sale_with_auth(sale_id, user_id, db)
    member = SaleTeamMember(sale_id=sale_id, name=data.name, title=data.title, bio=data.bio, photo_url=data.photo_url, sort_order=data.sort_order)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return TeamMemberResponse(id=str(member.id), name=member.name, title=member.title, bio=member.bio, photo_url=member.photo_url, sort_order=member.sort_order)

@router.delete("/team/{member_id}", status_code=204)
async def remove_team_member(
    sale_id: UUID,
    member_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await _get_sale_with_auth(sale_id, user_id, db)
    result = await db.execute(select(SaleTeamMember).where(SaleTeamMember.id == member_id, SaleTeamMember.sale_id == sale_id))
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    await db.delete(member)
    await db.commit()


# --- FAQs ---

@router.get("/faqs", response_model=list[FAQResponse])
async def list_faqs(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FAQResponse]:
    result = await db.execute(select(SaleFAQ).where(SaleFAQ.sale_id == sale_id).order_by(SaleFAQ.sort_order))
    return [FAQResponse(id=str(f.id), question=f.question, answer=f.answer, sort_order=f.sort_order) for f in result.scalars().all()]

@router.post("/faqs", response_model=FAQResponse, status_code=201)
async def add_faq(
    sale_id: UUID,
    data: FAQCreate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FAQResponse:
    await _get_sale_with_auth(sale_id, user_id, db)
    faq = SaleFAQ(sale_id=sale_id, question=data.question, answer=data.answer, sort_order=data.sort_order)
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return FAQResponse(id=str(faq.id), question=faq.question, answer=faq.answer, sort_order=faq.sort_order)

@router.delete("/faqs/{faq_id}", status_code=204)
async def remove_faq(
    sale_id: UUID,
    faq_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await _get_sale_with_auth(sale_id, user_id, db)
    result = await db.execute(select(SaleFAQ).where(SaleFAQ.id == faq_id, SaleFAQ.sale_id == sale_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ not found")
    await db.delete(faq)
    await db.commit()


# --- Images ---

@router.get("/images", response_model=list[ImageResponse])
async def list_images(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ImageResponse]:
    result = await db.execute(select(SaleImage).where(SaleImage.sale_id == sale_id).order_by(SaleImage.sort_order))
    return [ImageResponse(id=str(i.id), url=i.url, caption=i.caption, is_banner=i.is_banner, sort_order=i.sort_order) for i in result.scalars().all()]

@router.post("/images", response_model=ImageResponse, status_code=201)
async def add_image(
    sale_id: UUID,
    data: ImageCreate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImageResponse:
    await _get_sale_with_auth(sale_id, user_id, db)
    image = SaleImage(sale_id=sale_id, url=data.url, caption=data.caption, is_banner=data.is_banner, sort_order=data.sort_order)
    db.add(image)
    await db.commit()
    await db.refresh(image)
    return ImageResponse(id=str(image.id), url=image.url, caption=image.caption, is_banner=image.is_banner, sort_order=image.sort_order)

@router.delete("/images/{image_id}", status_code=204)
async def remove_image(
    sale_id: UUID,
    image_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await _get_sale_with_auth(sale_id, user_id, db)
    result = await db.execute(select(SaleImage).where(SaleImage.id == image_id, SaleImage.sale_id == sale_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    await db.delete(image)
    await db.commit()


# --- Documents ---

@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    sale_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DocumentResponse]:
    result = await db.execute(select(SaleDocument).where(SaleDocument.sale_id == sale_id))
    return [DocumentResponse(id=str(d.id), name=d.name, doc_type=d.doc_type, url=d.url, ipfs_hash=d.ipfs_hash) for d in result.scalars().all()]

@router.post("/documents", response_model=DocumentResponse, status_code=201)
async def add_document(
    sale_id: UUID,
    data: DocumentCreate,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DocumentResponse:
    await _get_sale_with_auth(sale_id, user_id, db)
    doc = SaleDocument(sale_id=sale_id, name=data.name, doc_type=data.doc_type, url=data.url, ipfs_hash=data.ipfs_hash)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse(id=str(doc.id), name=doc.name, doc_type=doc.doc_type, url=doc.url, ipfs_hash=doc.ipfs_hash)

@router.delete("/documents/{doc_id}", status_code=204)
async def remove_document(
    sale_id: UUID,
    doc_id: UUID,
    user_id: CurrentUserId,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await _get_sale_with_auth(sale_id, user_id, db)
    result = await db.execute(select(SaleDocument).where(SaleDocument.id == doc_id, SaleDocument.sale_id == sale_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()
