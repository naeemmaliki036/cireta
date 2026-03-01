"""Notification schemas."""

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    message: str
    data: dict | None = None
    read: bool
    created_at: str

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    total: int
    unread_count: int


class UnreadCountResponse(BaseModel):
    count: int


class NotificationPreferences(BaseModel):
    email_investments: bool = True
    email_kyc: bool = True
    email_sales: bool = True
    email_dividends: bool = True
    inapp_investments: bool = True
    inapp_kyc: bool = True
    inapp_sales: bool = True
    inapp_dividends: bool = True
