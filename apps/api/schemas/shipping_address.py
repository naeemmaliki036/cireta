"""Pydantic schemas for the investor shipping-address book."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ShippingAddressBase(BaseModel):
    """Shared fields between create / update / response."""

    label: str | None = Field(default=None, max_length=120)
    recipient_name: str = Field(..., min_length=1, max_length=255)
    line1: str = Field(..., min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(..., min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    postal_code: str = Field(..., min_length=1, max_length=30)
    country: str = Field(..., min_length=3, max_length=3, description="ISO 3166-1 alpha-3")
    phone: str = Field(..., min_length=4, max_length=40)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("country")
    @classmethod
    def _country_uppercase(cls, v: str) -> str:
        return v.upper()


class ShippingAddressCreate(ShippingAddressBase):
    is_default: bool = False


class ShippingAddressUpdate(BaseModel):
    """Partial update — every field optional."""

    label: str | None = Field(default=None, max_length=120)
    recipient_name: str | None = Field(default=None, min_length=1, max_length=255)
    line1: str | None = Field(default=None, min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, min_length=1, max_length=30)
    country: str | None = Field(default=None, min_length=3, max_length=3)
    phone: str | None = Field(default=None, min_length=4, max_length=40)
    notes: str | None = Field(default=None, max_length=500)
    is_default: bool | None = None

    @field_validator("country")
    @classmethod
    def _country_uppercase(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class ShippingAddressResponse(ShippingAddressBase):
    id: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
