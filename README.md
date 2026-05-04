# TradingAgents-WebUI

[English](#english) | [中文](#中文)

## English

TradingAgents-WebUI is a Docker-ready React/FastAPI control console for
[TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents).

The project keeps a stable browser-facing API over the upstream TradingAgents
Python package, so the frontend can keep working when upstream model catalogs or
runtime options change. Most selectable options are loaded from `/api/metadata`
instead of being hard-coded in the React app.

### Features

- Visual configuration for ticker, analysis date, analysts, research depth, LLM
  provider/model/base URL, output language, checkpointing, and data vendors
- Secret entry with masked status only; API keys are not returned to the browser
- Queued single-run execution with Server-Sent Events for live progress
- Active run recovery after browser refresh, plus stop/cancel controls for
  queued and running analyses
- Ordered batch analysis for multiple tickers, with configurable parallel stock
  workers
- Report tabs for agent output, final report, stats, and decision
- Persistent report history for reviewing prior runs and preparing future
  backtesting workflows
- Account login, admin/user role separation, user balances, isolated secret
  permissions, token statistics, order records, pre-authorization, post-run
  settlement, refunds, manual recharge, and configurable token/per-run pricing
- Custom OpenAI-compatible LLM endpoints and custom HTTP data interfaces
- Per-agent LLM routing so parallelizable or rate-limit-sensitive steps can use
  separate provider/API-key/model/Base URL settings
- Dedicated Settings view for API keys, provider Base URLs, data interfaces,
  and provider model discovery
- English and Chinese WebUI with a persistent language switch
- Docker Compose runtime with persistent logs, cache, memory, secrets, and WebUI
  settings

### Run With Docker

```bash
docker compose up --build web
```

Open `http://localhost:8000`.

### Local Development

Backend:

```bash
uv run uvicorn web.backend.app:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd web/frontend
npm install
npm run dev
```

### Compatibility Strategy

The React app reads provider, model, language, analyst, data vendor, and secret
metadata from `/api/metadata`. When upstream TradingAgents adds or renames
runtime options, update the backend metadata/adapter layer first; the frontend
will continue rendering most option changes without code changes.

Completed reports are archived under the WebUI data directory and exposed via
`GET /api/reports/history` and `GET /api/reports/history/{runId}`. Each archive
stores the run metadata, report payload, final report, decision, and non-secret
configuration snapshot, which gives future backtesting features a stable input
surface.

### Accounts and Billing

On first launch, the WebUI asks you to create the first administrator account.
After that, all protected APIs require login. Administrators can configure API
keys, provider settings, data interfaces, users, recharge records, and pricing.
Normal users can run stock analyses, stop their own runs, view their own active
workflows, view their historical reports, and inspect their own orders.

Billing is local-file based for v1. Before an analysis starts, the backend
freezes the maximum estimated cost from the user's balance. When the run
finishes, fails, or is cancelled, the backend reads the collected token stats,
deducts the actual charge, and returns the unused frozen amount. Pricing can be
token-based, fixed per run, or hybrid; administrators can set token prices,
consumption multiplier, depth multipliers, fixed depth prices, and estimated
pre-authorization tokens. Recharges are exposed as manual admin operations and
order records, so a real payment provider can be added later without changing
the report/run billing contract.

### Custom Interfaces

The Settings view keeps API keys and provider connection details out of the
daily run workspace. After saving a provider API key, click `Fetch models` to
load model IDs from providers that expose model discovery. OpenAI-compatible
providers use `GET {baseUrl}/models`; Google and Anthropic use provider-specific
model list APIs. If a provider cannot list models, the WebUI falls back to the
static model choices exposed by `/api/metadata`.

To use an OpenAI-compatible gateway, select `Custom OpenAI-compatible` in the
settings, enter the gateway Base URL, set the quick/deep model IDs, and save
`CUSTOM_OPENAI_API_KEY` in the API key panel. This works for gateways that
implement the OpenAI Chat Completions API.

To use a custom data service, choose `custom` for one or more data vendor
categories, or override a specific backend data method such as `get_news` or
`get_global_news`, then set that category's Base URL and endpoint paths. The
WebUI calls:

```http
POST {baseUrl}{endpoint}
Content-Type: application/json
Authorization: Bearer CUSTOM_DATA_API_KEY
```

Payload:

```json
{
  "method": "get_news",
  "args": ["SPY"],
  "kwargs": { "curr_date": "2026-05-01" }
}
```

The response may be plain text, JSON, or JSON with a top-level `data` field.

### Parallelism and Backtest Observation

The current upstream TradingAgents graph runs the analyst nodes in a fixed
sequence, then runs research debate, trader, and risk debate in order. The safest
parallelism in this WebUI is therefore multiple stock runs at once. Set
`Parallel stock runs` to 2-8 to let the backend process several tickers
concurrently.

The Settings page also exposes per-agent LLM routes. The four initial analysts
are marked as parallel-ready for future graph fan-out; debate, trader, and risk
nodes remain sequential but can still use separate API keys to reduce provider
rate-limit pressure.

The `Backtest watch` tab parses completed reports into an observation checklist:
entry condition first, then stop/target/risk checks only after entry is reached.
It does not change the TradingAgents backend strategy logic; it prepares a
stable review surface for later automated backtesting.

SOCKS5/HTTP proxying is intentionally not enabled as a raw WebUI field because
an arbitrary proxy can see prompts, report content, and API credentials. For
trusted network routing, point a route `Base URL` at your own OpenAI-compatible
gateway or provider-side proxy instead.

### License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

## 中文

TradingAgents-WebUI 是一个面向
[TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
的 React/FastAPI 可视化控制台，支持 Docker 一键运行。

本项目在浏览器前端和上游 TradingAgents Python 包之间提供一层稳定 API。
前端的大多数可选项都从 `/api/metadata` 动态读取，而不是写死在 React
代码里，因此当上游新增模型、供应商或运行参数时，通常只需要更新后端适配层，
前端可以尽量保持兼容。

### 功能

- 可视化配置股票代码、分析日期、分析师团队、研究深度、LLM 供应商/模型/API
  地址、报告输出语言、断点续跑和数据源
- API Key 只支持写入和掩码状态展示，不会向浏览器返回明文密钥
- 单任务队列执行，并通过 Server-Sent Events 实时展示运行进度
- 浏览器刷新后可恢复正在排队/运行中的工作流，并支持停止排队或运行中的分析
- 支持多股票按列表提交，并可配置股票任务并行 worker 数
- 报告 Tabs 展示智能体输出、最终报告、统计信息和决策结果
- 持久化历史报告，方便回看历史运行结果，并为后续回测功能准备数据基础
- 支持账号登录、管理员/普通用户分级、用户余额、API Key 权限隔离、Token
  统计、订单记录、预授权冻结、运行后结算、多余退款、手动充值，以及可配置的
  Token/按次/混合计费
- 支持自定义 OpenAI-compatible 模型接口和自定义 HTTP 数据接口
- 支持按智能体配置独立 LLM 路由，使可并行或容易限流的步骤可以使用不同的
  供应商/API Key/模型/Base URL
- 独立 Settings 页面，集中管理 API Key、供应商 Base URL、数据接口和模型拉取
- WebUI 支持中文和英文界面，并记住用户选择
- Docker Compose 持久化日志、缓存、记忆、密钥和 WebUI 配置

### 使用 Docker 运行

```bash
docker compose up --build web
```

打开 `http://localhost:8000`。

### 本地开发

后端：

```bash
uv run uvicorn web.backend.app:app --host 127.0.0.1 --port 8000
```

前端：

```bash
cd web/frontend
npm install
npm run dev
```

### 兼容策略

React 前端会从 `/api/metadata` 读取供应商、模型、语言、分析师、数据源和密钥字段。
当上游 TradingAgents 新增或重命名运行选项时，优先更新后端 metadata/adapter
层；大多数选项变化不需要改前端页面。

完成的报告会归档到 WebUI 数据目录，并通过 `GET /api/reports/history` 和
`GET /api/reports/history/{runId}` 暴露。每份归档包含运行元数据、报告内容、
最终报告、决策结果和不含密钥的配置快照，后续回测功能可以直接复用这层稳定数据。

### 账号与计费

首次启动 WebUI 时，需要先创建第一个管理员账号。之后受保护 API 都需要登录。
管理员可以设置 API Key、供应商参数、数据接口、用户、充值记录和价格；普通用户
只能发起股票分析、停止自己的任务、查看自己的运行工作流、历史报告和订单记录。

v1 的计费系统使用本地文件存储。分析开始前，后端会按最大预估费用从用户余额中
冻结额度；任务完成、失败或取消后，后端读取实际 Token 统计，按实际费用扣款，
并把多余冻结额退回余额。价格支持按 Token、按次和混合计费；管理员可以设置
Token 单价、消耗倍数、研究深度倍率、按深度固定费用和预授权估算 Token。
充值目前以管理员手动入账和订单记录的方式提供，后续接入真实支付渠道时可以复用
现有订单与结算接口。

### 自定义接口

Settings 页面会把 API Key 和供应商连接配置从日常运行工作台里拆出来。保存供应商
API Key 后，可以点击 `拉取模型` 从支持模型发现的供应商读取模型 ID。
OpenAI-compatible 供应商会调用 `GET {baseUrl}/models`；Google 和 Anthropic
使用各自的模型列表接口。如果供应商不支持自动列模型，WebUI 会回退到
`/api/metadata` 暴露的静态模型选项。

如果要使用 OpenAI-compatible 网关，在设置里选择 `Custom OpenAI-compatible`，
填写网关 Base URL、快速/深度模型 ID，并在 API Key 面板保存
`CUSTOM_OPENAI_API_KEY`。该模式适用于实现 OpenAI Chat Completions API 的服务。

如果要使用自定义数据服务，将某个数据分类的数据源选择为 `custom`，或单独覆盖
`get_news`、`get_global_news` 等后端数据方法，然后为该分类填写 Base URL 和
endpoint path。WebUI 会发起：

```http
POST {baseUrl}{endpoint}
Content-Type: application/json
Authorization: Bearer CUSTOM_DATA_API_KEY
```

请求体：

```json
{
  "method": "get_news",
  "args": ["SPY"],
  "kwargs": { "curr_date": "2026-05-01" }
}
```

响应可以是纯文本、JSON，或带顶层 `data` 字段的 JSON。

### 并行与回测观察

当前上游 TradingAgents 图里，分析师节点按固定顺序运行，随后研究辩论、交易员、
风控辩论也都有上下文依赖。因此 WebUI v1 最稳妥的提速方式是多股票并行运行：
把 `股票并行数` 设为 2-8 后，后端会用多个 worker 同时处理不同股票。

Settings 页面还提供按智能体的 LLM 路由。四个初始分析师被标记为“可并行”，方便后续
做图内 fan-out；辩论、交易员和风控节点保持顺序执行，但仍可分配独立 API Key，
用于分摊供应商限流。

`回测观察` 标签会把完成报告拆成复盘清单：必须先触达到入场条件，之后才统计止损、
目标价和风险条件是否命中。它不改 TradingAgents 后端策略逻辑，只为后续自动回测
准备稳定的观察面。

WebUI 没有默认加入任意 SOCKS5/HTTP 代理字段，因为代理端可能看到提示词、报告内容
和 API Key。需要可信网络路由时，建议把某个路由的 `Base URL` 指向你自己控制的
OpenAI-compatible 网关或供应商侧代理。

### 开源协议

本项目使用 Apache License 2.0 协议开源。详见 [LICENSE](LICENSE)。
