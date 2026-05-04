from __future__ import annotations

import re
import threading
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from .schemas import (
    BacktestCheckpoint,
    BacktestParsedPlan,
    BacktestPriceBar,
    BacktestRecord,
    BacktestResult,
    BacktestRunResponse,
    BacktestScheduleConfig,
    HistoricalReport,
    UserPublic,
)

if TYPE_CHECKING:
    from .storage import WebStorage


CHECKPOINTS = ("parse_report", "fetch_market_data", "evaluate_report", "finalize_record")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BacktestEngine:
    def __init__(self, storage: "WebStorage") -> None:
        self.storage = storage

    def run_report(self, archive: HistoricalReport, config: BacktestScheduleConfig | None = None) -> BacktestRecord:
        existing = self.storage.load_backtest_record(archive.run.id)
        if existing is not None and existing.status == "completed":
            return existing

        config = config or self.storage.load_backtest_config()
        record = existing or BacktestRecord(
            id=str(uuid.uuid4()),
            runId=archive.run.id,
            userId=archive.run.user_id,
            ticker=archive.run.ticker,
            analysisDate=archive.run.analysis_date,
            status="pending",
            createdAt=utc_now(),
            updatedAt=utc_now(),
        )
        if existing is not None and existing.status in {"running", "waiting_data", "failed"}:
            record.resume_count += 1

        try:
            record.status = "running"
            record.error = None
            self._checkpoint(record, "parse_report", "running")
            if not record.plan.entry_plan and not record.plan.target_plan:
                record.plan = parse_report_plan(archive)
            self._checkpoint(record, "parse_report", "completed")

            self._checkpoint(record, "fetch_market_data", "running")
            price_source = config.price_data_source
            if not record.price_bars:
                end = min(date.today(), archive.run.analysis_date + timedelta(days=config.review_window_days))
                record.price_bars = self._fetch_price_bars(archive.run.ticker, archive.run.analysis_date, end, config)
            if not record.price_bars:
                record.status = "waiting_data"
                record.result = BacktestResult(outcome="waiting_data", priceSource=price_source, notes=["No price bars are available yet."])
                self._checkpoint(record, "fetch_market_data", "failed", "No price bars are available yet.")
                self.storage.save_backtest_record(record)
                return record
            self._checkpoint(record, "fetch_market_data", "completed")

            self._checkpoint(record, "evaluate_report", "running")
            record.result = evaluate_plan(record.plan, record.price_bars, price_source=price_source)
            self._checkpoint(record, "evaluate_report", "completed")

            record.status = "completed"
            record.completed_at = utc_now()
            self._checkpoint(record, "finalize_record", "completed")
            return record
        except Exception as exc:
            record.status = "failed"
            record.error = str(exc)
            self._checkpoint(record, record.last_checkpoint or "evaluate_report", "failed", str(exc))
            return record

    def _fetch_price_bars(self, ticker: str, start: date, end: date, config: BacktestScheduleConfig) -> list[BacktestPriceBar]:
        if config.price_data_source == "custom":
            secrets = self.storage.load_secrets()
            return fetch_custom_price_bars(
                ticker,
                start,
                end,
                config,
                secrets.get("BACKTEST_DATA_API_KEY") or secrets.get("CUSTOM_DATA_API_KEY"),
            )
        return fetch_price_bars(ticker, start, end)

    def run_due(self, limit: int = 20, ticker: str | None = None, user: UserPublic | None = None) -> BacktestRunResponse:
        config = self.storage.load_backtest_config()
        history = self.storage.list_report_history(limit=500, user_id=None if user is None or user.role == "admin" else user.id).items
        records: list[BacktestRecord] = []
        skipped = 0
        for item in history:
            if ticker and item.ticker != ticker:
                continue
            existing = self.storage.load_backtest_record(item.run_id)
            if existing is not None and existing.status == "completed":
                skipped += 1
                continue
            archive = self.storage.load_report_history(item.run_id)
            if archive is None:
                continue
            records.append(self.run_report(archive, config))
            if len(records) >= limit:
                break
        return BacktestRunResponse(records=records, skippedCompleted=skipped)

    def _checkpoint(self, record: BacktestRecord, key: str, status: str, message: str | None = None) -> None:
        now = utc_now()
        record.last_checkpoint = key
        record.updated_at = now
        existing = {checkpoint.key: checkpoint for checkpoint in record.checkpoints}
        existing[key] = BacktestCheckpoint(key=key, status=status, updatedAt=now, message=message)
        record.checkpoints = [existing[key] for key in CHECKPOINTS if key in existing]
        self.storage.save_backtest_record(record)


class BacktestScheduler:
    def __init__(self, storage: "WebStorage") -> None:
        self.storage = storage
        self.engine = BacktestEngine(storage)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                config = self.storage.load_backtest_config()
                state = self.storage.load_backtest_scheduler_state()
                if config.enabled and self._is_due(config, state.get("lastRunAt")):
                    self.storage.save_backtest_scheduler_state({"lastRunAt": utc_now().isoformat(), "status": "running"})
                    response = self.engine.run_due(limit=config.max_reports_per_cycle)
                    self.storage.save_backtest_scheduler_state(
                        {
                            "lastRunAt": utc_now().isoformat(),
                            "status": "idle",
                            "lastProcessed": len(response.records),
                            "lastSkippedCompleted": response.skipped_completed,
                        }
                    )
            except Exception as exc:
                self.storage.save_backtest_scheduler_state({"lastRunAt": utc_now().isoformat(), "status": "failed", "error": str(exc)})
            self._stop.wait(30)

    def _is_due(self, config: BacktestScheduleConfig, last_run_at: Any) -> bool:
        if not last_run_at:
            return True
        try:
            last = datetime.fromisoformat(str(last_run_at))
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
        except ValueError:
            return True
        return utc_now() - last >= timedelta(minutes=config.interval_minutes)


def parse_report_plan(archive: HistoricalReport) -> BacktestParsedPlan:
    text = report_text(archive)
    fallback = "Not explicit in the report; confirm manually."
    decision = extract_line(text, [
        r"最终交易建议\s*[：:]\s*([^\n]+)",
        r"最终交易决策\s*[：:]\s*([^\n]+)",
        r"Final\s+(?:trading\s+)?(?:recommendation|decision)\s*[：:]\s*([^\n]+)",
        r"Portfolio Manager Decision\s*\n+([^\n]+)",
    ]) or archive.decision or archive.run.decision or fallback
    entry = extract_line(text, [
        r"[-*]\s*(?:\*\*)?(?:策略|入场|买入计划)(?:\*\*)?\s*[：:]\s*([^\n]+)",
        r"(?:Entry|Strategy)\s*(?:plan)?\s*[：:]\s*([^\n]+)",
    ]) or fallback
    stop = extract_line(text, [
        r"[-*]\s*(?:\*\*)?(?:止损|止损位)(?:\*\*)?\s*[：:]\s*([^\n]+)",
        r"(?:Stop|Stop loss)\s*[：:]\s*([^\n]+)",
    ]) or fallback
    targets = extract_line(text, [
        r"[-*]\s*(?:\*\*)?(?:目标|目标价|止盈)(?:\*\*)?\s*[：:]\s*([^\n]+)",
        r"(?:Target|Targets|Take profit)\s*[：:]\s*([^\n]+)",
    ]) or fallback
    position = extract_line(text, [
        r"[-*]\s*(?:\*\*)?(?:仓位|头寸)(?:\*\*)?\s*[：:]\s*([^\n]+)",
        r"(?:Position|Sizing)\s*[：:]\s*([^\n]+)",
    ]) or fallback
    risks = extract_line(text, [
        r"[-*]\s*(?:\*\*)?(?:风险提示|风险|失效条件)(?:\*\*)?\s*[：:]\s*([^\n]+)",
        r"(?:Risk|Invalidation)\s*(?:trigger|note|condition)?s?\s*[：:]\s*([^\n]+)",
    ]) or fallback

    action = "unknown"
    upper_decision = decision.upper()
    if "BUY" in upper_decision or "做多" in decision or "买" in decision:
        action = "buy"
    elif "SELL" in upper_decision or "做空" in decision or "卖" in decision:
        action = "sell"
    elif "HOLD" in upper_decision or "观望" in decision or "持有" in decision:
        action = "hold"

    stop_numbers = extract_numbers(stop)
    stop_offset = None
    stop_levels = stop_numbers
    if re.search(r"(入场价|entry|below entry|above entry|ATR|价差)", stop, re.IGNORECASE) and stop_numbers:
        stop_offset = stop_numbers[0]
        stop_levels = []

    return BacktestParsedPlan(
        decision=decision,
        entryPlan=entry,
        stopPlan=stop,
        targetPlan=targets,
        positionPlan=position,
        riskPlan=risks,
        observationOrder=[
            "Check whether the entry condition is reached before counting stop or target outcomes.",
            "After entry, compare stop and target hits in chronological order.",
            "If one candle contains entry, stop, and target together, mark the outcome as ambiguous.",
        ],
        assumptions=[
            "Stops described as a distance below/above entry are computed from the observed entry price.",
            "Daily candles cannot resolve intraday order when stop and target are touched on the same day.",
        ],
        entryLevels=extract_numbers(entry),
        stopLevels=stop_levels,
        targetLevels=extract_numbers(targets),
        stopOffset=stop_offset,
        action=action,
        needsManualReview=action not in {"buy", "sell"} or not extract_numbers(entry),
    )


def evaluate_plan(plan: BacktestParsedPlan, bars: list[BacktestPriceBar], price_source: str = "yfinance") -> BacktestResult:
    if plan.action == "hold":
        return BacktestResult(outcome="not_actionable", barsChecked=len(bars), priceSource=price_source, notes=["Hold reports are tracked but not counted as actionable hits."])
    if plan.needs_manual_review or plan.action not in {"buy", "sell"}:
        return BacktestResult(outcome="manual_review", barsChecked=len(bars), priceSource=price_source, notes=["The report does not contain enough structured entry data for automatic review."])

    entry_level = _entry_level(plan)
    if entry_level is None:
        return BacktestResult(outcome="manual_review", barsChecked=len(bars), priceSource=price_source, notes=["No numeric entry level was found."])

    entry_index = None
    entry_bar = None
    for index, bar in enumerate(bars):
        if _bar_hits_entry(plan.action, bar, entry_level):
            entry_index = index
            entry_bar = bar
            break
    if entry_index is None or entry_bar is None:
        return BacktestResult(outcome="entry_not_hit", entryHit=False, barsChecked=len(bars), priceSource=price_source)

    stop_level = _stop_level(plan, entry_level)
    target_level = _target_level(plan)
    result = BacktestResult(
        outcome="entry_not_hit",
        entryHit=True,
        entryHitDate=entry_bar.date,
        entryHitPrice=entry_level,
        stopHit=False,
        targetHit=False,
        barsChecked=len(bars),
        priceSource=price_source,
    )

    for bar in bars[entry_index:]:
        stop_hit = stop_level is not None and _bar_hits_stop(plan.action, bar, stop_level)
        target_hit = target_level is not None and _bar_hits_target(plan.action, bar, target_level)
        if stop_hit and target_hit:
            result.outcome = "ambiguous"
            result.stop_hit = True
            result.stop_hit_date = bar.date
            result.stop_hit_price = stop_level
            result.target_hit = True
            result.target_hit_date = bar.date
            result.target_hit_price = target_level
            result.notes.append("Stop and target were both inside the same candle; intraday order is ambiguous.")
            return result
        if target_hit:
            result.outcome = "target_hit"
            result.target_hit = True
            result.target_hit_date = bar.date
            result.target_hit_price = target_level
            return result
        if stop_hit:
            result.outcome = "stop_hit"
            result.stop_hit = True
            result.stop_hit_date = bar.date
            result.stop_hit_price = stop_level
            return result

    result.outcome = "entry_not_hit"
    result.notes.append("Entry was reached, but neither target nor stop was reached inside the review window.")
    return result


def fetch_price_bars(ticker: str, start: date, end: date) -> list[BacktestPriceBar]:
    if end <= start:
        return []
    try:
        import yfinance as yf
    except ImportError:
        return []

    data = yf.download(ticker, start=str(start), end=str(end + timedelta(days=1)), progress=False, auto_adjust=False)
    if data is None or getattr(data, "empty", True):
        return []

    bars: list[BacktestPriceBar] = []
    for index, row in data.iterrows():
        current_date = index.date() if hasattr(index, "date") else date.fromisoformat(str(index)[:10])
        bars.append(
            BacktestPriceBar(
                date=current_date,
                open=_float_value(row.get("Open")),
                high=_float_value(row.get("High")),
                low=_float_value(row.get("Low")),
                close=_float_value(row.get("Close")),
            )
        )
    return bars


def fetch_custom_price_bars(
    ticker: str,
    start: date,
    end: date,
    config: BacktestScheduleConfig,
    api_key: str | None = None,
) -> list[BacktestPriceBar]:
    if end <= start or not config.custom_base_url:
        return []
    import requests

    url = f"{config.custom_base_url}{config.custom_endpoint}"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    response = requests.post(
        url,
        headers=headers,
        json={
            "ticker": ticker,
            "start": str(start),
            "end": str(end),
            "interval": "1d",
            "purpose": "backtest_observation",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    rows = _custom_rows(payload)
    return [bar for row in rows if (bar := _custom_bar(row)) is not None]


def report_text(archive: HistoricalReport) -> str:
    parts = [archive.final_report or "", archive.decision or "", archive.run.decision or ""]
    for value in archive.reports.values():
        parts.append(value if isinstance(value, str) else str(value))
    return "\n\n".join(part for part in parts if part)


def extract_line(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match and match.group(1):
            return match.group(1).replace("**", "").strip()
    return ""


def extract_numbers(text: str) -> list[float]:
    values: list[float] = []
    for match in re.finditer(r"(?<!\d)(\d+(?:\.\d+)?)(?:\s*[-~]\s*(\d+(?:\.\d+)?))?", text):
        first = float(match.group(1))
        if first > 0 and first not in values:
            values.append(first)
        if match.group(2):
            second = float(match.group(2))
            if second > 0 and second not in values:
                values.append(second)
    return values[:8]


def _entry_level(plan: BacktestParsedPlan) -> float | None:
    if not plan.entry_levels:
        return None
    return max(plan.entry_levels) if plan.action == "buy" else min(plan.entry_levels)


def _stop_level(plan: BacktestParsedPlan, entry_level: float) -> float | None:
    if plan.stop_levels:
        return max([level for level in plan.stop_levels if level < entry_level], default=min(plan.stop_levels)) if plan.action == "buy" else min([level for level in plan.stop_levels if level > entry_level], default=max(plan.stop_levels))
    if plan.stop_offset is not None:
        return entry_level - plan.stop_offset if plan.action == "buy" else entry_level + plan.stop_offset
    return None


def _target_level(plan: BacktestParsedPlan) -> float | None:
    if not plan.target_levels:
        return None
    return min(plan.target_levels) if plan.action == "buy" else max(plan.target_levels)


def _bar_hits_entry(action: str, bar: BacktestPriceBar, level: float) -> bool:
    if action == "buy":
        return bar.low is not None and bar.low <= level
    return bar.high is not None and bar.high >= level


def _bar_hits_stop(action: str, bar: BacktestPriceBar, level: float) -> bool:
    if action == "buy":
        return bar.low is not None and bar.low <= level
    return bar.high is not None and bar.high >= level


def _bar_hits_target(action: str, bar: BacktestPriceBar, level: float) -> bool:
    if action == "buy":
        return bar.high is not None and bar.high >= level
    return bar.low is not None and bar.low <= level


def _float_value(value: Any) -> float | None:
    try:
        if hasattr(value, "iloc"):
            value = value.iloc[0]
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _custom_rows(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    data = payload.get("bars", payload.get("data", payload.get("prices", [])))
    if isinstance(data, dict):
        data = data.get("bars", data.get("items", []))
    return data if isinstance(data, list) else []


def _custom_bar(row: Any) -> BacktestPriceBar | None:
    if not isinstance(row, dict):
        return None
    raw_date = row.get("date") or row.get("time") or row.get("timestamp")
    parsed_date = _date_value(raw_date)
    if parsed_date is None:
        return None
    return BacktestPriceBar(
        date=parsed_date,
        open=_float_value(row.get("open", row.get("Open"))),
        high=_float_value(row.get("high", row.get("High"))),
        low=_float_value(row.get("low", row.get("Low"))),
        close=_float_value(row.get("close", row.get("Close"))),
    )


def _date_value(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value, tz=timezone.utc).date()
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return date.fromisoformat(cleaned[:10])
        except ValueError:
            try:
                parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
                return parsed.date()
            except ValueError:
                return None
    return None
