# Prayer 项目常用开发与运维命令

SHELL := /bin/sh

# 可通过 `make PNPM='corepack pnpm' ...` 或环境变量覆盖。
PNPM ?= pnpm
DOCKER ?= docker
COMPOSE ?= docker compose
IMAGE ?= prayer:local
DOCKER_PLATFORM ?=
VERIFY_DIST_DIR ?= .next-verify

.DEFAULT_GOAL := help

.PHONY: help install dev build build-verify start \
	lint typecheck test test-watch check format ingest \
	db-check db-backup \
	docker-build docker-up docker-down docker-logs \
	napcat-up napcat-down napcat-status napcat-logs \
	pm-start pm-stop pm-restart pm-status pm-logs pm-delete pm-enable pm-disable

help: ## 显示可用目标
	@printf '%s\n' 'Prayer Makefile targets:'
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 按锁文件安装依赖
	$(PNPM) install --frozen-lockfile

dev: ## 启动开发服务器
	$(PNPM) dev

build: ## 构建生产版本
	$(PNPM) build

build-verify: ## 使用独立目录执行生产构建验证
	NEXT_DIST_DIR=$(VERIFY_DIST_DIR) $(PNPM) build

start: ## 启动生产服务器
	$(PNPM) start

lint: ## 运行 ESLint
	$(PNPM) lint

typecheck: ## 执行 TypeScript 类型检查
	$(PNPM) typecheck

test: ## 运行一次 Vitest 测试
	$(PNPM) test

test-watch: ## 以监听模式运行 Vitest
	$(PNPM) test:watch

check: ## 执行类型检查、Lint 和完整测试
	$(PNPM) check

format: ## 使用 Prettier 格式化 TypeScript 文件
	$(PNPM) format

ingest: ## 摄入 docs/kb/ 知识库内容
	$(PNPM) ingest

db-check: ## 检查数据库状态
	$(PNPM) db:check

db-backup: ## 备份数据库
	$(PNPM) db:backup

docker-build: ## 构建本项目 Docker 镜像（可用 DOCKER_PLATFORM 指定目标架构）
	$(DOCKER) build $(if $(DOCKER_PLATFORM),--platform $(DOCKER_PLATFORM),) -t $(IMAGE) .

docker-up: ## 构建并在 Docker 中启动本项目
	$(COMPOSE) up -d --build

docker-down: ## 停止并移除 Docker Compose 服务（保留 data/ 数据）
	$(COMPOSE) down

docker-logs: ## 查看 Docker Compose 服务日志
	$(COMPOSE) logs -f prayer

napcat-up: ## 在 Docker 中启动 NapCat（管理页面 http://localhost:6099/webui）
	$(COMPOSE) -f compose.napcat.yaml up -d

napcat-down: ## 停止 NapCat（保留 Docker 卷中的配置和 QQ 登录数据）
	$(COMPOSE) -f compose.napcat.yaml down

napcat-status: ## 查看 NapCat 运行状态
	$(COMPOSE) -f compose.napcat.yaml ps

napcat-logs: ## 查看 NapCat 日志（可能包含管理令牌和登录二维码，请勿公开）
	$(COMPOSE) -f compose.napcat.yaml logs -f napcat

pm-start: ## 构建并通过 PM2 启动服务
	$(PNPM) pm:start

pm-stop: ## 停止 PM2 服务但保留配置
	$(PNPM) pm:stop

pm-restart: ## 停止、重新构建并重启 PM2 服务
	$(PNPM) pm:restart

pm-status: ## 查看 PM2 服务状态
	$(PNPM) pm:status

pm-logs: ## 查看 PM2 实时日志
	$(PNPM) pm:logs

pm-delete: ## 从 PM2 移除服务
	$(PNPM) pm:delete

pm-enable: ## 配置 PM2 systemd 开机自启
	$(PNPM) pm:enable

pm-disable: ## 取消 PM2 systemd 开机自启
	$(PNPM) pm:disable
