from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from tradingagents.default_config import DEFAULT_CONFIG

from .constants import SECRET_FIELDS
from .schemas import SecretFieldStatus, WebConfig


def web_data_dir() -> Path:
    return Path(
        os.getenv(
            "TRADINGAGENTS_WEB_DATA_DIR",
            os.path.join(os.path.expanduser("~"), ".tradingagents", "web"),
        )
    )


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return f"{value[:2]}...{value[-1:]}"
    return f"{value[:4]}...{value[-4:]}"


class WebStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or web_data_dir()
        self.config_path = self.root / "config.json"
        self.secrets_path = self.root / "secrets.json"
        self.root.mkdir(parents=True, exist_ok=True)

    def load_config(self) -> WebConfig:
        if not self.config_path.exists():
            return WebConfig(
                data_vendors=dict(DEFAULT_CONFIG["data_vendors"]),
            )
        with self.config_path.open("r", encoding="utf-8") as handle:
            return WebConfig.model_validate(json.load(handle))

    def save_config(self, config: WebConfig) -> WebConfig:
        self.root.mkdir(parents=True, exist_ok=True)
        with self.config_path.open("w", encoding="utf-8") as handle:
            json.dump(config.model_dump(mode="json", by_alias=True), handle, indent=2)
        os.chmod(self.config_path, 0o600)
        return config

    def load_secrets(self) -> dict[str, str]:
        if not self.secrets_path.exists():
            return {}
        with self.secrets_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return {
            key: value
            for key, value in data.items()
            if key in SECRET_FIELDS and isinstance(value, str) and value
        }

    def save_secrets(self, updates: dict[str, str | None]) -> dict[str, SecretFieldStatus]:
        secrets = self.load_secrets()
        for key, value in updates.items():
            if key not in SECRET_FIELDS:
                continue
            if value is None or value == "":
                secrets.pop(key, None)
                os.environ.pop(key, None)
                continue
            stripped = value.strip()
            if stripped:
                secrets[key] = stripped
                os.environ[key] = stripped
        with self.secrets_path.open("w", encoding="utf-8") as handle:
            json.dump(secrets, handle, indent=2)
        os.chmod(self.secrets_path, 0o600)
        return self.secret_status()

    def load_secrets_into_env(self) -> None:
        for key, value in self.load_secrets().items():
            os.environ[key] = value

    def secret_status(self) -> dict[str, SecretFieldStatus]:
        secrets = self.load_secrets()
        return {
            key: SecretFieldStatus(configured=bool(secrets.get(key)), masked=mask_secret(secrets.get(key)))
            for key in SECRET_FIELDS
        }

    def runtime_config(self, web_config: WebConfig) -> dict[str, Any]:
        config = dict(DEFAULT_CONFIG)
        config["data_vendors"] = dict(web_config.data_vendors)
        config["max_debate_rounds"] = web_config.research_depth
        config["max_risk_discuss_rounds"] = web_config.research_depth
        config["quick_think_llm"] = web_config.quick_think_llm
        config["deep_think_llm"] = web_config.deep_think_llm
        config["backend_url"] = web_config.backend_url or None
        config["llm_provider"] = web_config.llm_provider.lower()
        config["google_thinking_level"] = web_config.google_thinking_level
        config["openai_reasoning_effort"] = web_config.openai_reasoning_effort
        config["anthropic_effort"] = web_config.anthropic_effort
        config["output_language"] = web_config.output_language
        config["checkpoint_enabled"] = web_config.checkpoint_enabled
        config["max_recur_limit"] = web_config.max_recur_limit
        return config
