# Go Scraper Service Makefile

.PHONY: proto build run clean

# 生成 proto 代码（Go）
proto:
	protoc --go_out=./api/proto/gen --go_opt=paths=source_relative \
		--go-grpc_out=./api/proto/gen --go-grpc_opt=paths=source_relative \
		--proto_path=./api/proto \
		./api/proto/scraper.proto

# 构建服务
build:
	go build -o bin/server cmd/server/main.go

# 运行服务
run:
	go run cmd/server/main.go

# 清理
clean:
	rm -rf bin/
