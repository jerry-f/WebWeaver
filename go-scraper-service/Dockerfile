# 构建阶段
FROM golang:1.24-alpine AS builder

WORKDIR /app

# 安装构建依赖（CycleTLS 需要 CGO）
RUN apk add --no-cache git ca-certificates gcc musl-dev

# 复制 go.mod 和 go.sum
COPY go.mod go.sum* ./
RUN go mod download

# 复制源代码
COPY . .

# 构建（启用 CGO 以支持 CycleTLS）
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /go-scraper ./cmd/server

# 运行阶段
FROM alpine:3.19

WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache ca-certificates libc6-compat

# 从构建阶段复制二进制文件
COPY --from=builder /go-scraper /app/go-scraper

# 暴露端口
EXPOSE 8080 50051

# 环境变量
ENV HTTP_PORT=8080
ENV GRPC_PORT=50051
ENV MAX_CONCURRENT=100
ENV REQUEST_TIMEOUT_MS=15000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# 运行
CMD ["/app/go-scraper"]
