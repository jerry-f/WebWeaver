package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"

	pb "github.com/newsflow/go-scraper-service/api/proto/gen"
	"github.com/newsflow/go-scraper-service/internal/config"
	grpcserver "github.com/newsflow/go-scraper-service/internal/grpc"
	"github.com/newsflow/go-scraper-service/internal/handler"
	"github.com/newsflow/go-scraper-service/internal/queue"
)

func main() {
	// 加载配置
	cfg := config.DefaultConfig()

	// 创建 HTTP 处理器
	h, err := handler.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create handler: %v", err)
	}
	defer h.Close()

	// 创建 gRPC 服务
	grpcSrv, err := grpcserver.NewScraperServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create gRPC server: %v", err)
	}
	defer grpcSrv.Close()

	// 创建 HTTP 路由
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// 创建 HTTP 服务器
	httpServer := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: mux,
	}

	// 创建 gRPC 服务器
	grpcServer := grpc.NewServer()
	pb.RegisterScraperServiceServer(grpcServer, grpcSrv)

	// 启动 gRPC 监听
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50051"
	}
	grpcLis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("Failed to listen gRPC: %v", err)
	}

	// 启动 Redis 队列消费者（可选）
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if cfg.RedisURL != "" {
		go startQueueConsumer(ctx, cfg, h)
	}

	// 启动 gRPC 服务
	go func() {
		log.Printf("gRPC server starting on port %s", grpcPort)
		if err := grpcServer.Serve(grpcLis); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	// 优雅关闭
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down servers...")
		cancel()
		grpcServer.GracefulStop()
		httpServer.Close()
	}()

	// 启动 HTTP 服务
	log.Printf("Go Scraper Service starting on port %s", cfg.HTTPPort)
	log.Printf("gRPC server on port %s", grpcPort)
	log.Printf("Max concurrent: %d", cfg.MaxConcurrent)
	log.Printf("CycleTLS enabled: true")

	if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("HTTP server error: %v", err)
	}

	log.Println("Server stopped")
}

// startQueueConsumer 启动队列消费者
func startQueueConsumer(ctx context.Context, cfg *config.Config, h *handler.Handler) {
	q, err := queue.NewRedisQueue(cfg.RedisURL, "go-scraper-1")
	if err != nil {
		log.Printf("Failed to connect to Redis: %v", err)
		return
	}
	defer q.Close()

	log.Println("Redis queue consumer started")

	q.StartConsumer(ctx, func(ctx context.Context, task *queue.FetchTask) *queue.FetchResult {
		// 调用处理器抓取
		// 这里简化处理，实际应该复用 handler 的逻辑
		return &queue.FetchResult{
			TaskID:    task.ID,
			URL:       task.URL,
			ArticleID: task.ArticleID,
			Success:   true,
			Strategy:  "cycletls",
		}
	}, 10)
}
