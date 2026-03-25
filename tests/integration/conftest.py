import pytest_asyncio
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession


from apps.api.models.token import Token


@pytest_asyncio.fixture(autouse=True)
async def _clear_all_token_init_states(db_session: AsyncSession) -> None:
    """Clear any contract_address from tokens before integration tests to avoid conflicts."""
    await db_session.execute(update(Token).values(contract_address=None, identity_registry_address=None, compliance_address=None, sale_contract_address=None, vault_address=None, fraction_token_address=None))
    await db_session.commit()
