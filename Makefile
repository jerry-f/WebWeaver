# NewsFlow Makefile
# 统一管理开发和部署命令

.PHONY: help go-scraper-dev go-scraper-prod go-scraper-stop go-scraper-logs proto-gen

# 默认目标：显示帮助
help:
	@echo "NewsFlow 命令列表:"
	@echo ""
	@echo "  Go Scraper 服务:"
	@echo "    make go-scraper-dev   - 本地开发模式（停止 Docker，本地启动 Go 服务）"
	@echo "    make go-scraper-prod  - 生产模式（重新构建并启动 Docker 容器）"
	@echo "    make go-scraper-stop  - 停止 go-scraper 容器"
	@echo "    make go-scraper-logs  - 查看 go-scraper 容器日志"
	@echo ""
	@echo "  Proto 生成:"
	@echo "    make proto-gen        - 生成 TypeScript 和 Go 的 proto 代码"
	@echo ""

# ============================================================
# Go Scraper 服务
# ============================================================

# 本地开发模式：停止 Docker 容器，本地启动 Go 服务
go-scraper-dev:
	@echo ">>> 停止 Docker 中的 go-scraper 服务..."
	docker compose stop go-scraper || true
	@echo ""
	@echo ">>> 启动本地 Go 服务..."
	@echo ">>> HTTP: http://localhost:8080  |  gRPC: localhost:50051"
	@echo ""
	cd go-scraper-service && \
		HTTP_PORT=8080 \
		GRPC_PORT=50051 \
		MAX_CONCURRENT=100 \
		BROWSERLESS_URL=http://localhost:3300 \
		go run ./cmd/server/main.go

# 生产模式：重新构建并启动 Docker 容器
go-scraper-prod:
	@echo ">>> 重新构建 go-scraper 镜像..."
	docker compose build go-scraper
	@echo ""
	@echo ">>> 启动 go-scraper 容器..."
	docker compose up -d go-scraper
	@echo ""
	@echo ">>> go-scraper 已启动"
	@echo ">>> HTTP: http://localhost:8088  |  gRPC: localhost:50051"
	docker compose ps go-scraper

# 停止 go-scraper 容器
go-scraper-stop:
	docker compose stop go-scraper

# 查看 go-scraper 日志
go-scraper-logs:
	docker compose logs -f go-scraper

# ============================================================
# Proto 生成
# ============================================================

# 生成 TypeScript 和 Go 的 proto 代码
proto-gen:
	@echo ">>> 生成 TypeScript proto 类型..."
	protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_out=./src/lib/fetchers/clients \
		--ts_proto_opt=esModuleInterop=true,outputServices=generic-definitions,useExactTypes=false \
		--proto_path=./go-scraper-service/api/proto \
		./go-scraper-service/api/proto/scraper.proto
	@echo ">>> TypeScript 类型已生成: src/lib/fetchers/clients/scraper.ts"
	@echo ""
	@echo ">>> 生成 Go proto 代码..."
	cd go-scraper-service && make proto
	@echo ">>> Go 代码已生成: go-scraper-service/api/proto/gen/"

