from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from uuid import UUID

from tradingagents.default_config import DEFAULT_CONFIG

from .constants import SECRET_FIELDS
from .auth import hash_password, new_salt, new_session_token, session_token_hash, verify_password
from .schemas import (
    AdminUserCreate,
    AdminUserUpdate,
    BacktestRecord,
    BacktestRecordList,
    BacktestScheduleConfig,
    BacktestTickerSummary,
    OrderListResponse,
    OrderRecord,
    PricingConfig,
    PublicPricing,
    HistoricalReport,
    ReportHistoryItem,
    ReportHistoryList,
    RechargeRequest,
    RunBilling,
    RunInfo,
    RunReports,
    SecretFieldStatus,
    TokenUsage,
    UserPublic,
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
        self.users_path = self.root / "users.json"
        self.sessions_path = self.root / "sessions.json"
        self.pricing_path = self.root / "pricing.json"
        self.orders_path = self.root / "orders.json"
        self.backtest_config_path = self.root / "backtest_config.json"
        self.backtest_records_path = self.root / "backtests.json"
        self.backtest_scheduler_path = self.root / "backtest_scheduler.json"
        self.history_dir = self.root / "history"
        self._lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)

    def _load_json(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _atomic_write_json(self, path: Path, payload: Any) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False, default=str)
        os.chmod(tmp_path, 0o600)
        tmp_path.replace(path)
        os.chmod(path, 0o600)

    def users_exist(self) -> bool:
        with self._lock:
            return bool(self._load_users())

    def create_bootstrap_admin(self, username: str, password: str, display_name: str | None, initial_balance: Decimal) -> UserPublic:
        with self._lock:
            if self._load_users():
                raise ValueError("Bootstrap is only available before the first user exists.")
            request = AdminUserCreate(
                username=username,
                password=password,
                displayName=display_name,
                role="admin",
                initialBalance=initial_balance,
            )
            return self.create_user(request)

    def create_user(self, request: AdminUserCreate) -> UserPublic:
        with self._lock:
            users = self._load_users()
            username_key = request.username.lower()
            if any(user["username"].lower() == username_key for user in users.values()):
                raise ValueError("Username already exists.")
            now = datetime.now(timezone.utc)
            salt = new_salt()
            user_id = str(uuid.uuid4())
            users[user_id] = {
                "id": user_id,
                "username": request.username,
                "display_name": request.display_name,
                "role": request.role,
                "balance": str(_money(request.initial_balance)),
                "frozen_balance": "0",
                "is_active": request.is_active,
                "password_salt": salt,
                "password_hash": hash_password(request.password, salt),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
            self._save_users(users)
            return self._public_user(users[user_id])

    def update_user(self, user_id: str, update: AdminUserUpdate) -> UserPublic | None:
        with self._lock:
            users = self._load_users()
            user = users.get(user_id)
            if user is None:
                return None
            if update.display_name is not None:
                user["display_name"] = update.display_name.strip() or None
            if update.role is not None:
                user["role"] = update.role
            if update.is_active is not None:
                user["is_active"] = update.is_active
            if update.password is not None:
                salt = new_salt()
                user["password_salt"] = salt
                user["password_hash"] = hash_password(update.password, salt)
            user["updated_at"] = datetime.now(timezone.utc).isoformat()
            self._save_users(users)
            return self._public_user(user)

    def list_users(self) -> list[UserPublic]:
        with self._lock:
            users = [self._public_user(user) for user in self._load_users().values()]
        users.sort(key=lambda user: user.created_at)
        return users

    def get_user(self, user_id: str) -> UserPublic | None:
        with self._lock:
            user = self._load_users().get(user_id)
            return self._public_user(user) if user else None

    def authenticate_user(self, username: str, password: str) -> UserPublic | None:
        with self._lock:
            for user in self._load_users().values():
                if user["username"].lower() != username.strip().lower():
                    continue
                if not user.get("is_active", True):
                    return None
                if verify_password(password, user["password_salt"], user["password_hash"]):
                    return self._public_user(user)
        return None

    def create_session(self, user_id: str, ttl_hours: int = 24 * 14) -> str:
        token = new_session_token()
        token_hash = session_token_hash(token)
        now = datetime.now(timezone.utc)
        with self._lock:
            sessions = self._load_sessions()
            sessions[token_hash] = {
                "token_hash": token_hash,
                "user_id": user_id,
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=ttl_hours)).isoformat(),
            }
            self._save_sessions(self._prune_sessions(sessions))
        return token

    def get_user_for_session(self, token: str | None) -> UserPublic | None:
        if not token:
            return None
        token_hash = session_token_hash(token)
        with self._lock:
            sessions = self._prune_sessions(self._load_sessions())
            session = sessions.get(token_hash)
            if session is None:
                self._save_sessions(sessions)
                return None
            user = self._load_users().get(session["user_id"])
            self._save_sessions(sessions)
            if user is None or not user.get("is_active", True):
                return None
            return self._public_user(user)

    def delete_session(self, token: str | None) -> None:
        if not token:
            return
        token_hash = session_token_hash(token)
        with self._lock:
            sessions = self._load_sessions()
            sessions.pop(token_hash, None)
            self._save_sessions(sessions)

    def load_pricing(self) -> PricingConfig:
        with self._lock:
            return PricingConfig.model_validate(self._load_json(self.pricing_path, {}))

    def save_pricing(self, pricing: PricingConfig) -> PricingConfig:
        with self._lock:
            self._atomic_write_json(self.pricing_path, pricing.model_dump(mode="json", by_alias=True))
            return pricing

    def public_pricing(self) -> PublicPricing:
        pricing = self.load_pricing()
        return PublicPricing(
            currency=pricing.currency,
            billing_mode=pricing.billing_mode,
            token_multiplier=pricing.token_multiplier,
            input_token_price_per_1m=pricing.input_token_price_per_1m,
            output_token_price_per_1m=pricing.output_token_price_per_1m,
            fixed_run_price=pricing.fixed_run_price,
            minimum_run_charge=pricing.minimum_run_charge,
            depth_multipliers=pricing.depth_multipliers,
            fixed_prices_by_depth=pricing.fixed_prices_by_depth,
        )

    def list_orders(self, user_id: str | None = None, limit: int = 100) -> OrderListResponse:
        limit = max(1, min(limit, 500))
        with self._lock:
            orders = [OrderRecord.model_validate(order) for order in self._load_orders().values()]
        if user_id is not None:
            orders = [order for order in orders if order.user_id == user_id]
        orders.sort(key=lambda order: order.created_at, reverse=True)
        return OrderListResponse(orders=orders[:limit])

    def create_recharge_order(self, user_id: str, request: RechargeRequest, actor_id: str | None = None) -> OrderRecord:
        with self._lock:
            users = self._load_users()
            user = users.get(user_id)
            if user is None:
                raise ValueError("User not found.")
            now = datetime.now(timezone.utc)
            amount = _money(request.amount)
            balance = _decimal(user["balance"]) + amount
            user["balance"] = str(_money(balance))
            user["updated_at"] = now.isoformat()
            order = OrderRecord(
                id=str(uuid.uuid4()),
                userId=user_id,
                type="recharge",
                status="completed",
                currency=self.load_pricing().currency,
                amount=amount,
                actualAmount=amount,
                balanceAfter=_money(balance),
                externalOrderId=request.external_order_id,
                description=request.note or (f"Manual recharge by {actor_id}" if actor_id else "Manual recharge"),
                createdAt=now,
                updatedAt=now,
            )
            orders = self._load_orders()
            orders[order.id] = order.model_dump(mode="json", by_alias=True)
            self._save_users(users)
            self._save_orders(orders)
            return order

    def preauthorize_analysis(self, user_id: str, run_id: str, config: WebConfig) -> RunBilling:
        with self._lock:
            users = self._load_users()
            user = users.get(user_id)
            if user is None or not user.get("is_active", True):
                raise ValueError("User account is not available.")
            pricing = self.load_pricing()
            usage = TokenUsage(
                inputTokens=pricing.estimated_input_tokens_by_depth.get(str(config.research_depth), 0),
                outputTokens=pricing.estimated_output_tokens_by_depth.get(str(config.research_depth), 0),
            )
            estimated = calculate_analysis_cost(pricing, config, usage, estimate=True)
            frozen = _money(max(estimated * pricing.preauth_multiplier, pricing.preauth_floor))
            balance = _decimal(user["balance"])
            if balance < frozen:
                raise ValueError(f"Insufficient balance. Available {balance} {pricing.currency}, need {frozen} {pricing.currency}.")
            now = datetime.now(timezone.utc)
            user["balance"] = str(_money(balance - frozen))
            user["frozen_balance"] = str(_money(_decimal(user["frozen_balance"]) + frozen))
            user["updated_at"] = now.isoformat()
            order = OrderRecord(
                id=str(uuid.uuid4()),
                userId=user_id,
                type="analysis",
                status="preauthorized",
                currency=pricing.currency,
                frozenAmount=frozen,
                runId=run_id,
                description=f"Pre-authorized analysis for {config.ticker}",
                usage=usage,
                pricingSnapshot=pricing.model_dump(mode="json", by_alias=True),
                createdAt=now,
                updatedAt=now,
            )
            orders = self._load_orders()
            orders[order.id] = order.model_dump(mode="json", by_alias=True)
            self._save_users(users)
            self._save_orders(orders)
            return self.order_billing_summary(order)

    def ensure_batch_balance(self, user_id: str, config: WebConfig, run_count: int) -> None:
        with self._lock:
            users = self._load_users()
            user = users.get(user_id)
            if user is None or not user.get("is_active", True):
                raise ValueError("User account is not available.")
            pricing = self.load_pricing()
            required = self.estimate_preauthorization(config, pricing) * Decimal(max(1, run_count))
            balance = _decimal(user["balance"])
            if balance < required:
                raise ValueError(f"Insufficient balance. Available {balance} {pricing.currency}, need {required} {pricing.currency}.")

    def estimate_preauthorization(self, config: WebConfig, pricing: PricingConfig | None = None) -> Decimal:
        pricing = pricing or self.load_pricing()
        usage = TokenUsage(
            inputTokens=pricing.estimated_input_tokens_by_depth.get(str(config.research_depth), 0),
            outputTokens=pricing.estimated_output_tokens_by_depth.get(str(config.research_depth), 0),
        )
        estimated = calculate_analysis_cost(pricing, config, usage, estimate=True)
        return _money(max(estimated * pricing.preauth_multiplier, pricing.preauth_floor))

    def settle_analysis_order(self, order_id: str | None, config: WebConfig, stats: dict[str, Any], status: str) -> RunBilling | None:
        if not order_id:
            return None
        with self._lock:
            orders = self._load_orders()
            raw_order = orders.get(order_id)
            if raw_order is None:
                return None
            order = OrderRecord.model_validate(raw_order)
            if order.status != "preauthorized":
                return self.order_billing_summary(order)
            users = self._load_users()
            user = users.get(order.user_id)
            if user is None:
                return self.order_billing_summary(order)
            pricing = PricingConfig.model_validate(order.pricing_snapshot or {})
            usage = usage_from_stats(stats)
            actual = calculate_analysis_cost(pricing, config, usage, estimate=False)
            if status == "cancelled" and usage.input_tokens == 0 and usage.output_tokens == 0:
                actual = Decimal("0")
            charged = _money(min(actual, order.frozen_amount))
            refund = _money(order.frozen_amount - charged)
            overage = _money(max(actual - order.frozen_amount, Decimal("0")))
            frozen_balance = max(_decimal(user["frozen_balance"]) - order.frozen_amount, Decimal("0"))
            user["frozen_balance"] = str(_money(frozen_balance))
            user["balance"] = str(_money(_decimal(user["balance"]) + refund))
            user["updated_at"] = datetime.now(timezone.utc).isoformat()
            order.status = "settled" if status == "succeeded" else "cancelled" if status == "cancelled" else "failed_settled"
            order.amount = charged
            order.actual_amount = _money(actual)
            order.refunded_amount = refund
            order.overage_amount = overage
            order.balance_after = _decimal(user["balance"])
            order.usage = usage
            order.updated_at = datetime.now(timezone.utc)
            orders[order.id] = order.model_dump(mode="json", by_alias=True)
            self._save_users(users)
            self._save_orders(orders)
            return self.order_billing_summary(order)

    def order_billing_summary(self, order: OrderRecord) -> RunBilling:
        return RunBilling(
            orderId=order.id,
            status=order.status,
            currency=order.currency,
            preauthorizedAmount=order.frozen_amount,
            actualAmount=order.actual_amount,
            refundedAmount=order.refunded_amount,
            overageAmount=order.overage_amount,
            balanceAfter=order.balance_after,
            usage=order.usage,
        )

    def billing_for_order(self, order_id: str | None) -> RunBilling | None:
        if not order_id:
            return None
        with self._lock:
            order = self._load_orders().get(order_id)
            return self.order_billing_summary(OrderRecord.model_validate(order)) if order else None

    def load_backtest_config(self) -> BacktestScheduleConfig:
        with self._lock:
            return BacktestScheduleConfig.model_validate(self._load_json(self.backtest_config_path, {}))

    def save_backtest_config(self, config: BacktestScheduleConfig) -> BacktestScheduleConfig:
        with self._lock:
            self._atomic_write_json(self.backtest_config_path, config.model_dump(mode="json", by_alias=True))
            return config

    def load_backtest_scheduler_state(self) -> dict[str, Any]:
        with self._lock:
            state = self._load_json(self.backtest_scheduler_path, {})
            return state if isinstance(state, dict) else {}

    def save_backtest_scheduler_state(self, state: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self.load_backtest_scheduler_state()
            current.update(state)
            self._atomic_write_json(self.backtest_scheduler_path, current)
            return current

    def load_backtest_record(self, run_id: str) -> BacktestRecord | None:
        with self._lock:
            record = self._load_backtest_records().get(run_id)
            return BacktestRecord.model_validate(record) if record else None

    def save_backtest_record(self, record: BacktestRecord) -> BacktestRecord:
        with self._lock:
            records = self._load_backtest_records()
            records[record.run_id] = record.model_dump(mode="json", by_alias=True)
            self._save_backtest_records(records)
            return record

    def list_backtest_records(self, ticker: str | None = None, user_id: str | None = None, limit: int = 100) -> BacktestRecordList:
        limit = max(1, min(limit, 500))
        with self._lock:
            records = [BacktestRecord.model_validate(record) for record in self._load_backtest_records().values()]
        if ticker is not None:
            records = [record for record in records if record.ticker == ticker]
        if user_id is not None:
            records = [record for record in records if record.user_id == user_id]
        records.sort(key=lambda record: record.updated_at, reverse=True)
        return BacktestRecordList(records=records[:limit])

    def backtest_ticker_summary(self, ticker: str, user_id: str | None = None) -> BacktestTickerSummary:
        ticker_history = [self._history_item(archive) for archive in self._load_history_archives()]
        if user_id is not None:
            ticker_history = [item for item in ticker_history if item.user_id == user_id]
        ticker_history = [item for item in ticker_history if item.ticker == ticker]
        with self._lock:
            records = [BacktestRecord.model_validate(record) for record in self._load_backtest_records().values()]
        records = [record for record in records if record.ticker == ticker]
        if user_id is not None:
            records = [record for record in records if record.user_id == user_id]
        completed = [record for record in records if record.status == "completed"]
        return BacktestTickerSummary(
            ticker=ticker,
            totalReports=len(ticker_history),
            recordsTotal=len(records),
            completedRecords=len(completed),
            pendingRecords=len([record for record in records if record.status != "completed"]),
            actionableRecords=len([record for record in completed if record.result.outcome not in {"manual_review", "not_actionable", "waiting_data"}]),
            entryHits=len([record for record in completed if record.result.entry_hit]),
            targetHits=len([record for record in completed if record.result.target_hit]),
            stopHits=len([record for record in completed if record.result.stop_hit]),
            ambiguous=len([record for record in completed if record.result.outcome == "ambiguous"]),
            manualReview=len([record for record in completed if record.result.outcome == "manual_review"]),
            waitingData=len([record for record in records if record.status == "waiting_data" or record.result.outcome == "waiting_data"]),
        )

    def _load_backtest_records(self) -> dict[str, dict[str, Any]]:
        payload = self._load_json(self.backtest_records_path, {"records": []})
        records = payload.get("records", []) if isinstance(payload, dict) else []
        return {
            record["runId"]: record
            for record in records
            if isinstance(record, dict) and record.get("runId")
        }

    def _save_backtest_records(self, records: dict[str, dict[str, Any]]) -> None:
        self._atomic_write_json(self.backtest_records_path, {"records": list(records.values())})

    def _load_users(self) -> dict[str, dict[str, Any]]:
        payload = self._load_json(self.users_path, {"users": []})
        users = payload.get("users", []) if isinstance(payload, dict) else []
        return {user["id"]: user for user in users if isinstance(user, dict) and user.get("id")}

    def _save_users(self, users: dict[str, dict[str, Any]]) -> None:
        self._atomic_write_json(self.users_path, {"users": list(users.values())})

    def _public_user(self, record: dict[str, Any]) -> UserPublic:
        return UserPublic.model_validate({
            "id": record["id"],
            "username": record["username"],
            "display_name": record.get("display_name"),
            "role": record["role"],
            "balance": record.get("balance", "0"),
            "frozen_balance": record.get("frozen_balance", "0"),
            "is_active": record.get("is_active", True),
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        })

    def _load_sessions(self) -> dict[str, dict[str, Any]]:
        payload = self._load_json(self.sessions_path, {"sessions": []})
        sessions = payload.get("sessions", []) if isinstance(payload, dict) else []
        return {session["token_hash"]: session for session in sessions if isinstance(session, dict) and session.get("token_hash")}

    def _save_sessions(self, sessions: dict[str, dict[str, Any]]) -> None:
        self._atomic_write_json(self.sessions_path, {"sessions": list(sessions.values())})

    def _prune_sessions(self, sessions: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        now = datetime.now(timezone.utc)
        return {
            key: session
            for key, session in sessions.items()
            if _parse_datetime(session.get("expires_at")) > now
        }

    def _load_orders(self) -> dict[str, dict[str, Any]]:
        payload = self._load_json(self.orders_path, {"orders": []})
        orders = payload.get("orders", []) if isinstance(payload, dict) else []
        return {order["id"]: order for order in orders if isinstance(order, dict) and order.get("id")}

    def _save_orders(self, orders: dict[str, dict[str, Any]]) -> None:
        self._atomic_write_json(self.orders_path, {"orders": list(orders.values())})

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
        secrets = {
            key: value
            for key in SECRET_FIELDS
            if isinstance((value := os.environ.get(key)), str) and value
        }
        if not self.secrets_path.exists():
            return secrets
        with self.secrets_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        secrets.update({
            key: value
            for key, value in data.items()
            if key in SECRET_FIELDS and isinstance(value, str) and value
        })
        return secrets

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

    def list_report_history(self, limit: int = 50, user_id: str | None = None) -> ReportHistoryList:
        limit = max(1, min(limit, 1000))
        items = [self._history_item(archive) for archive in self._load_history_archives()]
        if user_id is not None:
            items = [item for item in items if item.user_id == user_id]
        items.sort(key=lambda item: item.ended_at or item.submitted_at, reverse=True)
        return ReportHistoryList(items=items[:limit])

    def load_report_history(self, run_id: str) -> HistoricalReport | None:
        path = self._history_path(run_id)
        if path is None or not path.exists():
            return None
        return self._load_history_file(path)

    def can_access_history(self, run_id: str, user: UserPublic) -> bool:
        archive = self.load_report_history(run_id)
        if archive is None:
            return False
        return user.role == "admin" or archive.run.user_id == user.id

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
            user_id=archive.run.user_id,
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
        config["tool_vendors"] = dict(web_config.tool_vendors)
        config["llm_routes"] = {
            key: value.model_dump(mode="json", by_alias=True)
            for key, value in web_config.llm_routes.items()
        }
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
        config["max_parallel_runs"] = web_config.max_parallel_runs
        return config


MONEY_QUANT = Decimal("0.000001")


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _money(value: Any) -> Decimal:
    return _decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return datetime.fromtimestamp(0, tz=timezone.utc)
    return datetime.fromtimestamp(0, tz=timezone.utc)


def usage_from_stats(stats: dict[str, Any]) -> TokenUsage:
    return TokenUsage(
        inputTokens=max(0, int(stats.get("tokens_in") or stats.get("input_tokens") or 0)),
        outputTokens=max(0, int(stats.get("tokens_out") or stats.get("output_tokens") or 0)),
        llmCalls=max(0, int(stats.get("llm_calls") or 0)),
        toolCalls=max(0, int(stats.get("tool_calls") or 0)),
    )


def calculate_analysis_cost(pricing: PricingConfig, config: WebConfig, usage: TokenUsage, estimate: bool = False) -> Decimal:
    depth = str(config.research_depth)
    input_price = pricing.input_token_price_per_1m
    output_price = pricing.output_token_price_per_1m
    model_multiplier = Decimal("1")
    for key in _model_price_keys(config):
        override = pricing.model_price_overrides.get(key)
        if override is None:
            continue
        if override.input_token_price_per_1m is not None:
            input_price = max(input_price, override.input_token_price_per_1m)
        if override.output_token_price_per_1m is not None:
            output_price = max(output_price, override.output_token_price_per_1m)
        if override.multiplier is not None:
            model_multiplier = max(model_multiplier, override.multiplier)

    depth_multiplier = pricing.depth_multipliers.get(depth, Decimal("1"))
    token_cost = (
        (Decimal(usage.input_tokens) / Decimal("1000000") * input_price)
        + (Decimal(usage.output_tokens) / Decimal("1000000") * output_price)
    ) * pricing.token_multiplier * depth_multiplier * model_multiplier

    fixed_cost = pricing.fixed_run_price + pricing.fixed_prices_by_depth.get(depth, Decimal("0"))
    if pricing.billing_mode == "per_run":
        total = fixed_cost
    elif pricing.billing_mode == "hybrid":
        total = fixed_cost + token_cost
    else:
        total = token_cost

    if not estimate and (usage.input_tokens > 0 or usage.output_tokens > 0):
        total = max(total, pricing.minimum_run_charge)
    return _money(total)


def _model_price_keys(config: WebConfig) -> list[str]:
    provider = config.llm_provider
    return [
        f"{provider}/{config.quick_think_llm}",
        f"{provider}/{config.deep_think_llm}",
        config.quick_think_llm,
        config.deep_think_llm,
        provider,
    ]
