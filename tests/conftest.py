"""Shared test fixtures."""

import os
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Set test environment before importing app
os.environ["ENVIRONMENT"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"

from packages.common.db.base import Base
from packages.common.db.session import get_db
from packages.common.models.user import User, UserRole
from packages.common.services.auth_service import AuthService
from apps.example_api.main import app


# Test database setup
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database() -> Generator[None, None, None]:
    """Create database tables before tests, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Get a test database session with transaction rollback."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """Get FastAPI test client with database override."""

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def auth_service(db_session: Session) -> AuthService:
    """Get AuthService instance for testing."""
    return AuthService(db_session)


@pytest.fixture
def test_user(db_session: Session, auth_service: AuthService) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        hashed_password=auth_service.hash_password("password123"),
        full_name="Test User",
        role=UserRole.USER,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_user(db_session: Session, auth_service: AuthService) -> User:
    """Create an admin test user."""
    user = User(
        email="admin@example.com",
        hashed_password=auth_service.hash_password("admin123"),
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User, auth_service: AuthService) -> dict[str, str]:
    """Get authentication headers for test user."""
    token = auth_service.create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(admin_user: User, auth_service: AuthService) -> dict[str, str]:
    """Get authentication headers for admin user."""
    token = auth_service.create_access_token(admin_user.id)
    return {"Authorization": f"Bearer {token}"}
