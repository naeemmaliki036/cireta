"""API v1 router registration."""

from fastapi import APIRouter

from apps.example_api.api.v1.endpoints import health


api_router = APIRouter()

# Register endpoint routers
api_router.include_router(
    health.router,
    prefix="/health",
    tags=["health"],
)

# Add more routers here:
# api_router.include_router(users.router, prefix="/users", tags=["users"])
# api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
