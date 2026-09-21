from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    hospital_rag_url: str | None = None
    hospital_rag_api_key: str | None = None
    hospital_rag_timeout_seconds: float = 30
    timezone: str = "Asia/Kolkata"
    cors_origins: str = "http://localhost:5173"
    appointment_hold_seconds: int = 30
    nvidia_api_key: str | None = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "mistralai/Mistral-NeMo-Minitron-8B-Instruct"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
