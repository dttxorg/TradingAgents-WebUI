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

### 开源协议

本项目使用 MIT 协议开源。详见 [LICENSE](LICENSE)。
