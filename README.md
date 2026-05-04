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
- Report tabs for agent output, final report, stats, and decision
- Persistent report history for reviewing prior runs and preparing future
  backtesting workflows
- Custom OpenAI-compatible LLM endpoints and custom HTTP data interfaces
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

### Custom Interfaces

To use an OpenAI-compatible gateway, select `Custom OpenAI-compatible` in the
settings, enter the gateway Base URL, set the quick/deep model IDs, and save
`CUSTOM_OPENAI_API_KEY` in the API key panel. This works for gateways that
implement the OpenAI Chat Completions API.

To use a custom data service, choose `custom` for one or more data vendor
categories and set that category's Base URL and endpoint paths. The WebUI calls:

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

### License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

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
- 报告 Tabs 展示智能体输出、最终报告、统计信息和决策结果
- 持久化历史报告，方便回看历史运行结果，并为后续回测功能准备数据基础
- 支持自定义 OpenAI-compatible 模型接口和自定义 HTTP 数据接口
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

### 自定义接口

如果要使用 OpenAI-compatible 网关，在设置里选择 `Custom OpenAI-compatible`，
填写网关 Base URL、快速/深度模型 ID，并在 API Key 面板保存
`CUSTOM_OPENAI_API_KEY`。该模式适用于实现 OpenAI Chat Completions API 的服务。

如果要使用自定义数据服务，将某个数据分类的数据源选择为 `custom`，然后为该分类
填写 Base URL 和 endpoint path。WebUI 会发起：

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

### 开源协议

本项目使用 MIT 协议开源。详见 [LICENSE](LICENSE)。
