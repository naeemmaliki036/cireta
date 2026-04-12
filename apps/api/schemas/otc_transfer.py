"""OTC transfer log schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class OtcTransferCreate(BaseModel):
    """Request body for recording an OTC transfer."""

    operator_address: str = Field(..., min_length=42, max_length=42)
    buyer_address: str = Field(..., min_length=42, max_length=42)
    fraction_id: int = Field(..., ge=1, le=2)
    amount: Decimal = Field(..., gt=0)
    tx_hash: str = Field(..., min_length=66, max_length=66)
    block_number: int = Field(..., gt=0)


class OtcTransferResponse(BaseModel):
    """Response for a single OTC transfer log entry."""

    id: str
    sale_id: str
    operator_address: str
    buyer_address: str
    fraction_id: int
    amount: str
    tx_hash: str
    block_number: int
    created_at: datetime

    model_config = {"from_attributes": True}
