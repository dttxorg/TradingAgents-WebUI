# Upgrading to the hardened WebUI build

This document covers `webui/main` at and after commit
`f1358ee` (the `docs: document audit commit's behavioural changes`
commit) and its predecessor `5362b8a` (`fix: harden web ui against 40+
security, billing, and concurrency bugs`).

These commits close a security and correctness audit. Many of the
fixes are user-visible behaviour changes, not just internal
clean-ups. If you run the WebUI in production, read this document
**before** you pull the new build, especially the *Behavioural
changes* section.

The README also has a shorter `Upgrading` section that points back
here for the full set of opt-out knobs and recovery steps.

---

## TL;DR

| Symptom you might hit on first boot | Why | How to recover |
|---|---|---|
| `RuntimeError: Refusing to start: TRADINGAGENTS does not support multi-worker deployments` | New safety check (C4/C5) | Run with one worker, or set `TRADINGAGENTS_REFUSE_MULTI_WORKER=0` (unsupported) |
| `422 Unprocessable Entity` when saving `customDataInterfaces`, `LLMRouteConfig`, or a `backtestConfig` with `reviewWindowDays > 365` | New schema-level guards (C6/C7/C8, H35, H37) | Lower the value / add a `modelId` / move the URL to a public host or set `TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS=1` |
| `403 Forbidden` from `/api/backtests/config` for a sub-account | H23 (admin-only) | No fix needed; remove the sub-account frontend call or grant the user admin |
| `429 Too Many Requests` on `POST /api/auth/login` after 5 wrong attempts in 5 min | H21 (rate limit) | Wait 15 minutes or reset the password as admin |
| Sub-account runs now return a different analysis config than before | C1 + H1 (visible_config enforcement) | Expected — sub-accounts no longer inherit admin URLs. If they relied on the leak, point the admin URL at a publicly reachable host |
| `favicon.ico` and other static assets fail to load in a reverse-proxy setup | H22 (cookie `secure` flag follows `TRADINGAGENTS_HTTPS`) | Set `TRADINGAGENTS_HTTPS=1` on a real HTTPS deployment, or `TRADINGAGENTS_SECURE_COOKIES=0` for plain-HTTP development |
| Orphaned preauthorised balances after pulling an old process | C2 (startup reconciliation) | The first new boot will refund them automatically |

---

## Behavioural changes

### 1. Multi-worker `uvicorn --workers N` refuses to start (C4 / C5)

**What changed.** The `RunManager` keeps in-process state (the run
queue, worker threads, event queues, `RunRecord` map), and
`WebStorage` only synchronises within a single process via a
`threading.RLock`. Running more than one worker means runs queued
on worker A are invisible to worker B, billing preauthorisation can
double-fire, and SSE reconnects land on a worker that never saw the
run. The new check raises a `RuntimeError` at startup if
`WEB_CONCURRENCY` or `UVICORN_WORKERS` is greater than one.

**Migration path.**
- **Recommended.** Run a single worker per container and scale
  horizontally behind a load balancer. Sticky sessions are not
  required as long as each user has at most one run in flight at a
  time; otherwise you'll need to migrate `RunManager` state to
  Redis or a similar shared store first.
- **Temporary opt-out.** Set
  `TRADINGAGENTS_REFUSE_MULTI_WORKER=0` in the environment. This
  brings back the old (broken) behaviour. Do this only as a stop-gap
  while you re-architect; data corruption under load is the expected
  failure mode.

### 2. SSRF guard refuses loopback / link-local / RFC1918 by default (C6 / C7 / C8)

**What changed.** Custom data vendors, backtest custom price APIs,
and `/api/models/fetch` now go through a single `ssrf_guard` module
that:

- rejects any URL whose hostname resolves to loopback
  (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, cloud
  metadata), multicast, or the unspecified address;
- rejects RFC1918 ranges (`10/8`, `172.16/12`, `192.168/16`,
  `fc00::/7`) by default;
- disables HTTP 30x redirect-following so a redirect to a private
  host cannot exfiltrate a bearer token;
- caps the outbound timeout at 30 seconds.

**Migration path.** If your existing config points a custom interface
at an internal reverse proxy, the schema validator will reject the
config on save with `422 Unprocessable Entity`. Either:

- expose the service via a public DNS name (recommended), or
- set `TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS=1` to opt in to
  private-network URLs. Loopback is still always refused.

The `ssrf_guard` rejects at both the schema layer (so bad URLs never
get persisted to `config.json`) and the runtime layer (defence in
depth, in case the file is hand-edited).

### 3. `LLMRouteConfig` requires an explicit `modelId` when `enabled=True` (H37)

**What changed.** Previously, an LLM route with `enabled: true` and
`modelId: null` would silently fall back to the global
`quickThinkLlm` / `deepThinkLlm`. The schema now rejects that
configuration as a Pydantic validation error.

**Migration path.** Open `/api/config` (or `config.json`), find each
`llmRoutes.*` entry, and set `modelId` to the actual model you want
that route to use. The model ID must be one of the values listed in
`/api/metadata` for the route's `provider`.

### 4. `reviewWindowDays` capped at 365 (was 3650) (H35)

**What changed.** A `BacktestScheduleConfig` with
`reviewWindowDays > 365` is now rejected. The previous ceiling of 10
years let a single `BacktestRecord` grow to several MB, which made
every `save_backtest_record` write the whole records array to disk
in a single fsync.

**Migration path.** Edit your backtest config to use 365 or fewer
days. If you need longer history, run the backtest in 365-day
windows and chain the resulting records.

### 5. Login rate limiting (H21)

**What changed.** Five wrong passwords within five minutes locks the
username for fifteen minutes. The lockout is per-username (case-
insensitive) and lives in process memory; restarting the process
resets the counters.

**Migration path.** Make sure your login UI can render a
`429 Too Many Requests` response with a clear "try again later"
message. If you have an external auth proxy in front of the WebUI
that already rate-limits, consider setting its threshold higher
than the WebUI's so the upstream proxy becomes the gate.

### 6. `/api/backtests/config` is admin-only (H23)

**What changed.** Sub-accounts can no longer read the backtest
configuration. The response includes `customBaseUrl` and
`customEndpoint`, which can be internal addresses.

**Migration path.** Audit any sub-account frontend code that calls
`GET /api/backtests/config`. It will start receiving `403`. Either
remove the call or proxy the read through an admin call.

### 7. SSE no longer broadcasts Python tracebacks (H31)

**What changed.** A failed run's `status` event used to include a
`traceback` field with the full Python stack. The frontend could
expose absolute file paths, library versions, and (worst case)
inlined environment values if the upstream library interpolated
them into the exception message. The field is gone; the new
payload is `{status, message, errorClass, billing}`.

**Migration path.** Search your frontend code for `traceback` reads
on run events. If you rendered the trace in the UI, switch to
`message` and `errorClass`. The full trace is still in the backend
log via the standard `logger`; admins can also reach it via
`/api/runs/{id}/reports` once the run settles.

### 8. `failed` SSE events redact long message content (H32)

**What changed.** LLM `message` events previously echoed the full
content of every chat completion, which can include system prompts
that quote an API key in the body. The new payload limits strings
in `message`, `tool`, `llm`, and `configuration` events to 4000
characters and runs a regex that redacts `sk-...`, `AIza...`,
`Bearer ...`, and `key=...` style values. The full content is
preserved in `save_report_history`; only the live SSE stream is
scrubbed.

**Migration path.** Frontend that paginates long messages may see
`...[truncated]` suffixes. If you need the full content, fetch the
report history after the run finishes.

### 9. Cancelling a queued run releases the preauthorised balance (H12)

**What changed.** Previously, cancelling a queued run returned 200
but left the user's `frozen_balance` stuck until the worker thread
finally happened to pick up the (now cancelled) record. The new
`cancel_run` settles the billing immediately.

**User-visible effect.** None, assuming the rest of the system is
working. The change is a fix for a class of reports where the
frozen balance on a user's account grew over time without ever
being refunded.

### 10. Batch cancel propagates to siblings (H10)

**What changed.** Cancelling any one ticket in a batch now also
cancels the queued siblings and refunds their preauthorisations.
Previously, cancelling ticket 3 of a 5-ticker batch left tickets 4
and 5 to run, wasting the user's balance.

**User-visible effect.** None for the common case. The behaviour is
now what the UI implied.

### 11. Deactivating a user drops their sessions (H38)

**What changed.** `PATCH /api/admin/users/{id}` with
`isActive: false` now also drops every active session for that
user. The next request with the old cookie returns `401`.

**Migration path.** None for normal use. If you have a custom
frontend that caches session state, be prepared to handle a `401`
on the request right after a deactivation.

### 12. Last active admin cannot demote or deactivate themselves (H20)

**What changed.** A single-admin deployment that previously could
`PATCH /api/admin/users/{self.id}` with `role: "user"` or
`isActive: false` now gets a `409 Conflict` with detail
"Refusing to demote or deactivate the last active admin." The same
admin cannot change their own role, even when other admins exist.

**Migration path.** Promote a second admin first, then demote the
original. There is no programmatic escape hatch; the bootstrap
endpoint is the only way to re-create an admin if you lock yourself
out.

### 13. Cookie `secure` flag follows `TRADINGAGENTS_HTTPS` (H22)

**What changed.** The session cookie's `secure` flag now defaults to
the value of `TRADINGAGENTS_HTTPS` (or `1` / `true` / `yes`). The
previous default of `False` silently downgraded cookies to plain
HTTP when an HTTPS reverse proxy was misconfigured.

**Migration path.** Set `TRADINGAGENTS_HTTPS=1` in any deployment
that is served over HTTPS. To force plain-HTTP local development,
set `TRADINGAGENTS_SECURE_COOKIES=0`.

### 14. Recharge orders are now idempotent on `externalOrderId` (M4)

**What changed.** A duplicate recharge with the same
`externalOrderId` returns the existing order instead of
re-crediting the user. The previous behaviour double-credited the
balance on network retries.

**Migration path.** None for normal use. If your front-end has been
deliberately sending empty `externalOrderId` to opt out of
deduplication, populate it now.

### 15. Orphan-preauth reconciliation at startup (C2)

**What changed.** On every boot, `storage.reconcile_orphan_orders()`
scans `orders.json` for `status: "preauthorized"` orders older
than 30 minutes and full-refunds them. This recovers balances
frozen by a previous process that died between preauthorisation
and billing settlement (most commonly `SIGKILL`).

**Migration path.** None. The first boot after upgrade may issue
several `failed_settled` orders. Watch the `/api/billing/orders`
admin view for a one-time spike.

### 16. Backtest scheduler state resets if a previous run was killed (C9)

**What changed.** `BacktestScheduler.start()` now resets a
`status: "running"` state from a previous process to
`status: "interrupted"`, so the next scheduler cycle knows
nothing is in flight.

**Migration path.** None.

### 17. `apply_market_profile` inserts a real `SystemMessage` (H29)

**What changed.** Previously the function prepended `("system",
prompt)` to the agent's message history. That was a tuple, not a
`langchain_core.messages.SystemMessage`, which newer versions of
LangChain refuse to consume. The new code inserts a real
`SystemMessage(content=prompt)`.

**Migration path.** None for normal use. Custom agent code that
inspected `state["messages"][0]` expecting a tuple will need to
switch to the `SystemMessage` interface.

### 18. Patched LLM client factory is no longer globally serialised (H25)

**What changed.** The `with patched_tradingagents_llm_client_factory`
context manager used to hold a process-wide `Lock` for the entire
`TradingAgentsGraph.__init__` call, which made
`maxParallelRuns > 1` have no effect. The new implementation
holds the lock only for the brief instant of swapping the
upstream `trading_graph.create_llm_client` attribute.

**Migration path.** None. Operators who saw graph builds back up
because they were all serialised on a single lock should now see
real parallelism.

### 19. DeepSeek thinking kwargs no longer mutate the upstream openai client (H26)

**What changed.** Calling
`apply_deepseek_thinking_kwargs` for a deepseek target used to also
add `extra_body` to `tradingagents.llm_clients.openai_client._PASSTHROUGH_KWARGS`
as a side effect. That side effect leaked `extra_body` into every
other OpenAI-compatible run afterwards, breaking providers that
reject the field. The new code passes `extra_body` per call only.

**Migration path.** None.

---

## New environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS` | unset (= deny) | Allow custom data / backtest price / model discovery base URLs that resolve to RFC1918 or link-local hosts. Loopback is always refused. |
| `TRADINGAGENTS_HTTPS` | unset | If set to `1`/`true`/`yes`, the session cookie is issued with `secure=True`. Set this when the app is served over HTTPS. |
| `TRADINGAGENTS_SECURE_COOKIES` | unset | Overrides `TRADINGAGENTS_HTTPS`. Use `0` to force plain-HTTP development. |
| `TRADINGAGENTS_REFUSE_MULTI_WORKER` | `1` | Set to `0` to allow `uvicorn --workers N` to start (unsupported, see §1). |
| `WEB_CONCURRENCY` / `UVICORN_WORKERS` | unset (single worker) | Read by the §1 check. |

No other env vars were added or renamed. Existing `TRADINGAGENTS_*`,
`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc. are unchanged.

---

## Operator pre-flight checklist

Before you pull the new build into a real deployment:

1. **Run the tests.** `pytest tests/` (in a venv with the dev
   requirements installed). The new fixtures expect
   `TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS=1` to be set, since
   the test suite uses private network URLs in its fixtures.

2. **Audit your `config.json`.** The schema will reject the
   following on the next `PUT /api/config`:
   - `customDataInterfaces.*.baseUrl` pointing at a loopback /
     link-local / RFC1918 host (unless you set
     `TRADINGAGENTS_ALLOW_PRIVATE_NETWORK_URLS=1`).
   - `llmRoutes.*` with `enabled: true` and no `modelId`.
   - `backtestConfig.reviewWindowDays > 365`.

   You can also run `python -c "from web.backend.schemas import
   WebConfig; WebConfig.model_validate_json(open('config.json').read())"`
   to surface these in CI before the upgrade.

3. **Audit your deployment manifests.** Any place that sets
   `WEB_CONCURRENCY` or `UVICORN_WORKERS` to a value greater than
   one will fail to start. Either drop the value, set it to `1`,
   or set `TRADINGAGENTS_REFUSE_MULTI_WORKER=0` and accept the
   data-corruption risk.

4. **Audit your reverse proxy.** If you serve the WebUI over
   HTTPS, set `TRADINGAGENTS_HTTPS=1` in the container so the
   session cookie gets the `secure` flag.

5. **Plan for the rate limit.** If your deployment has admin
   users who share a username across multiple devices, the new
   rate limit could lock them out on a typo. Communicate the new
   behaviour to operators.

6. **Sub-account frontends.** Audit any code that calls
   `/api/backtests/config` from a sub-account session. The new
   `403` will start landing.

7. **Custom UIs that read SSE tracebacks.** The `traceback` field
   on `failed` events is gone. Switch to `errorClass` + `message`.

---

## Rollback

If a deployment rolls back to a previous `webui/main` commit, the
`reconcile_orphan_orders` sweep on the next boot will not run
(since that code is not present), so any preauthorised orders
in-flight at rollback time will return to the original "stuck"
state until the next forward upgrade. No data is lost in either
direction.

The behaviour-change guard rails (SSRF refusal, multi-worker
refusal, login rate limit, last-admin protection) all live in the
new code only, so rolling forward again restores them.

---

## Reporting new issues

If you find an undocumented behaviour change, please open an issue
on `dttxorg/TradingAgents-WebUI` with:

- the exact commit you are upgrading to,
- a copy of the request that surfaced the new behaviour,
- your `WebConfig` snapshot (redact API keys).

The audit catalogue at `.claude/audit-bugs.md` in the source
branch (`codex/webui-post-run-reviewers` and earlier audit
branches) documents every change and the rationale.
