"""Test harness.

Tests run against a real Postgres (a `services: postgres` container in CI; a local
Postgres in dev) named by FRONTDESK_TEST_DATABASE_URL, defaulting to a
`frontdesk_test` database on localhost.

pytest-asyncio runs each test in its own event loop, but SQLAlchemy's async engine
pools connections bound to the loop that created them. So we reset the engine/session
singletons before every test — each test builds a fresh engine on its own loop — and
use NullPool to avoid any cross-loop connection reuse. Tables are created once; every
table is truncated before each test for a clean slate.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

# Point the app at the test database BEFORE any app module is imported.
_TEST_DB = os.environ.get(
    "FRONTDESK_TEST_DATABASE_URL",
    "postgresql+asyncpg://frontdesk:frontdesk@127.0.0.1:5432/frontdesk_test",
)
os.environ["FRONTDESK_DATABASE_URL"] = _TEST_DB
os.environ.setdefault("FRONTDESK_JWT_SECRET", "test-secret")
os.environ.setdefault("FRONTDESK_BCRYPT_ROUNDS", "4")  # cheap hashing for a fast suite

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import frontdesk.db as db  # noqa: E402
from frontdesk.main import create_app  # noqa: E402
from frontdesk.models import Base  # noqa: E402


def _reset_db_singletons() -> None:
    """Force the app's lazy engine/sessionmaker to be rebuilt on the current loop."""
    db._engine = None
    db._sessionmaker = None


@pytest_asyncio.fixture(autouse=True)
async def _clean() -> AsyncIterator[None]:
    _reset_db_singletons()
    engine = create_async_engine(_TEST_DB, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        tables = ", ".join(Base.metadata.tables.keys())
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await engine.dispose()
    # Rebuild the app singletons fresh for this test's loop.
    _reset_db_singletons()
    yield
    await db.get_engine().dispose()
    _reset_db_singletons()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def signup(client: AsyncClient, org: str, email: str) -> dict[str, str]:
    """Create an org + owner and return the auth token + ids."""
    resp = await client.post(
        "/api/auth/signup",
        json={"org_name": org, "name": "Owner", "email": email, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    return {
        "token": data["access_token"],
        "org_id": data["org_id"],
        "auth": f"Bearer {data['access_token']}",
    }


@pytest.fixture
def make_headers():  # type: ignore[no-untyped-def]
    def _h(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    return _h
