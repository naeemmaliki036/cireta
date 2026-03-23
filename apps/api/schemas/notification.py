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
    email_investment_updates: bool = True
    email_kyc_status: bool = True
    email_sale_announcements: bool = True
    email_dividends: bool = True
    inapp_investment_updates: bool = True
    inapp_kyc_status: bool = True
    inapp_sale_announcements: bool = True
    inapp_dividends: bool = True
