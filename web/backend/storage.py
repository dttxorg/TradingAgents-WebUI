from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from tradingagents.default_config import DEFAULT_CONFIG

from .constants import SECRET_FIELDS
from .schemas import (
    HistoricalReport,
    ReportHistoryItem,
    ReportHistoryList,
    RunInfo,
    RunReports,
    SecretFieldStatus,
    WebConfig,
)


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
        self.history_dir = self.root / "history"
        self.root.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)

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

    def save_report_history(self, run: RunInfo, config: WebConfig, reports: RunReports) -> HistoricalReport:
        archive = HistoricalReport(
            archived_at=datetime.now(timezone.utc),
            run=run,
            config=config,
            reports=reports.reports,
            final_report=reports.final_report,
            decision=reports.decision,
        )
        path = self._history_path(run.id)
        if path is None:
            raise ValueError("Run ID must be a UUID.")
        tmp_path = path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(archive.model_dump(mode="json", by_alias=True), handle, indent=2, ensure_ascii=False)
        os.chmod(tmp_path, 0o600)
        tmp_path.replace(path)
        os.chmod(path, 0o600)
        return archive

    def list_report_history(self, limit: int = 50) -> ReportHistoryList:
        limit = max(1, min(limit, 200))
        items = [self._history_item(archive) for archive in self._load_history_archives()]
        items.sort(key=lambda item: item.ended_at or item.submitted_at, reverse=True)
        return ReportHistoryList(items=items[:limit])

    def load_report_history(self, run_id: str) -> HistoricalReport | None:
        path = self._history_path(run_id)
        if path is None or not path.exists():
            return None
        return self._load_history_file(path)

    def _history_path(self, run_id: str) -> Path | None:
        try:
            normalized = str(UUID(run_id))
        except ValueError:
            return None
        return self.history_dir / f"{normalized}.json"

    def _load_history_archives(self) -> list[HistoricalReport]:
        archives: list[HistoricalReport] = []
        for path in self.history_dir.glob("*.json"):
            archive = self._load_history_file(path)
            if archive is not None:
                archives.append(archive)
        return archives

    def _load_history_file(self, path: Path) -> HistoricalReport | None:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return HistoricalReport.model_validate(json.load(handle))
        except (OSError, ValueError, TypeError):
            return None

    def _history_item(self, archive: HistoricalReport) -> ReportHistoryItem:
        return ReportHistoryItem(
            run_id=archive.run.id,
            ticker=archive.run.ticker,
            analysis_date=archive.run.analysis_date,
            status=archive.run.status,
            submitted_at=archive.run.submitted_at,
            ended_at=archive.run.ended_at,
            decision=archive.decision or archive.run.decision,
            provider=archive.config.llm_provider,
            output_language=archive.config.output_language,
            analysts=archive.config.analysts,
            research_depth=archive.config.research_depth,
            stats=archive.run.stats,
            archived_at=archive.archived_at,
        )

    def runtime_config(self, web_config: WebConfig) -> dict[str, Any]:
        config = dict(DEFAULT_CONFIG)
        config["data_vendors"] = dict(web_config.data_vendors)
        config["custom_data_interfaces"] = {
            key: value.model_dump(mode="json", by_alias=True)
            for key, value in web_config.custom_data_interfaces.items()
        }
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
