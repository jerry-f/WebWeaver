本地调试 Go 抓取服务步骤
1. 停止 Docker 中的 go-scraper 服务

# 只停止 go-scraper 容器，保留其他服务（redis、browserless 等）
docker compose stop go-scraper

# 或者完全移除该容器
docker compose rm -f go-scraper
2. 进入 Go 服务目录并启动

cd /home/ufei/on-call/newsflow/go-scraper-service

# 确保依赖已下载
go mod tidy

# 本地启动（开发模式）
go run ./cmd/server/main.go
3. 环境变量配置（可选）
根据 main.go 和 docker-compose.yml，可以设置以下环境变量：


# 设置环境变量后启动
HTTP_PORT=8080 \
GRPC_PORT=50051 \
MAX_CONCURRENT=100 \
BROWSERLESS_URL=http://localhost:3300 \
go run ./cmd/server/main.go
4. 验证服务启动
服务启动后会显示：


Go Scraper Service starting on port 8080
gRPC server on port 50051
Max concurrent: 100
CycleTLS enabled: true
测试健康检查：


curl http://localhost:8080/health
5. 确保 Next.js 连接本地服务
检查 .env 或 .env.local 中的配置：


GO_SCRAPER_URL=http://localhost:8080
GO_SCRAPER_GRPC_URL=localhost:50051
快速命令总结

# 一键操作
docker compose stop go-scraper && \
cd /home/ufei/on-call/newsflow/go-scraper-service && \
go run ./cmd/server/main.go