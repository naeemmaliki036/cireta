"""Base Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema with common configuration.

    All schemas should inherit from this class.
    """

    model_config = ConfigDict(
        from_attributes=True,  # Allow creating from ORM models
        str_strip_whitespace=True,  # Strip whitespace from strings
        validate_default=True,  # Validate default values
    )


class IdMixin(BaseModel):
    """Mixin for schemas with an ID field."""

    id: int


class TimestampMixin(BaseModel):
    """Mixin for schemas with timestamp fields."""

    created_at: datetime
    updated_at: datetime | None = None


class PaginatedResponse(BaseSchema):
    """Base schema for paginated responses."""

    total: int
    skip: int
    limit: int


class ErrorResponse(BaseSchema):
    """Schema for error responses."""

    code: str
    message: str
    details: dict | None = None


class SuccessResponse(BaseSchema):
    """Schema for success responses."""

    success: bool = True
    message: str = "Operation completed successfully"
