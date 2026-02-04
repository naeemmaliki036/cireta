# Tests

Test suites for the scaffold monorepo.

## Structure

```
tests/
├── conftest.py       # Shared fixtures
├── unit/             # Unit tests (isolated, fast)
├── integration/      # Integration tests (with database)
└── e2e/              # End-to-end tests (full stack)
```

## Running Tests

```bash
# Run all tests
make test

# Run specific test suites
make test-unit
make test-integration

# Run with coverage
make test-cov
```

## Test Categories

### Unit Tests (`tests/unit/`)

- Test individual functions/classes in isolation
- Mock external dependencies
- Should be fast (<100ms per test)

```python
def test_hash_password():
    hashed = AuthService.hash_password("password123")
    assert AuthService.verify_password("password123", hashed)
```

### Integration Tests (`tests/integration/`)

- Test components working together
- Use test database
- Test service layer with real database

```python
async def test_create_user(db_session, auth_service):
    user = await auth_service.create_user(UserCreate(email="test@example.com"))
    assert user.id is not None
```

### E2E Tests (`tests/e2e/`)

- Test complete user workflows
- Use TestClient for API tests
- May use browser automation (Playwright)

```python
def test_login_flow(client):
    response = client.post("/api/v1/auth/login", json={...})
    assert response.status_code == 200
```

## Fixtures

Common fixtures are defined in `conftest.py`:

- `db_session` - Clean database session
- `client` - FastAPI TestClient
- `auth_headers` - Authenticated request headers
- `mock_user` - Mock user for auth tests

## Best Practices

1. **Isolation**: Each test should be independent
2. **Naming**: Use descriptive names (`test_user_creation_fails_with_duplicate_email`)
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Coverage**: Aim for >80% coverage on business logic
