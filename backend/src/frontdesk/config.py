from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, all overridable by env vars (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="FRONTDESK_", extra="ignore")

    database_url: str = "postgresql+asyncpg://frontdesk:frontdesk@localhost:5432/frontdesk"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_minutes: int = 60 * 24
    bcrypt_rounds: int = 12  # tests override to 4 for speed

    # Stripe test mode. Against stripe-mock these are dummy values; the SDK only
    # needs api_base pointed at the mock. On real Stripe, set a real test key.
    stripe_api_key: str = "sk_test_frontdesk"
    stripe_api_base: str = "http://localhost:12111"
    stripe_price_pro: str = "price_pro_monthly"
    stripe_webhook_secret: str = ""  # empty => skip signature check (test mode)

    # Seat limits per plan. Free tier is capped; pro is generous.
    free_seat_limit: int = 3
    pro_seat_limit: int = 50

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
