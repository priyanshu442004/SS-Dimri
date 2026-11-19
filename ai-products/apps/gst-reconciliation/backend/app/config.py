from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    app_env: str = "development"
    data_dir: str = "data"

    # DeepSeek (OpenAI-compatible chat-completions API) — same variables as the other product backends
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-v4-pro"
    deepseek_base_url: str = "https://api.deepseek.com"
    ai_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def absolute_data_dir(self) -> Path:
        candidate = Path(self.data_dir)
        return candidate if candidate.is_absolute() else BACKEND_DIR / candidate

    @property
    def ai_configured(self) -> bool:
        return self.ai_enabled and bool(self.deepseek_api_key.strip())


settings = Settings()
