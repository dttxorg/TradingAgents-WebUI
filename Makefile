COMPOSE ?= docker compose
PROJECT ?= tradingagents-webui
SERVICE ?= web

.PHONY: up upgrade restart logs down

up:
	$(COMPOSE) -p $(PROJECT) up -d --build $(SERVICE)

upgrade:
	git pull --ff-only
	$(COMPOSE) -p $(PROJECT) up -d --build $(SERVICE)

restart:
	$(COMPOSE) -p $(PROJECT) restart $(SERVICE)

logs:
	$(COMPOSE) -p $(PROJECT) logs -f $(SERVICE)

down:
	$(COMPOSE) -p $(PROJECT) down
