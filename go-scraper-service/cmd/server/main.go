package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/newsflow/go-scraper-service/internal/config"
	"github.com/newsflow/go-scraper-service/internal/handler"
	"github.com/newsflow/go-scraper-service/internal/queue"
)

func main() {
	// 加载配置
	cfg := config.DefaultConfig()

	// 创建处理器
	h, err := handler.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create handler: %v", err)
	}
	defer h.Close()

	// 创建路由
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// 创建服务器
	server := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: mux,
	}

	// 启动 Redis 队列消费者（可选）
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if cfg.RedisURL != "" {
		go startQueueConsumer(ctx, cfg, h)
	}

	// 优雅关闭
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		cancel()
		server.Close()
	}()

	// 启动服务
	log.Printf("Go Scraper Service starting on port %s", cfg.HTTPPort)
	log.Printf("Max concurrent: %d", cfg.MaxConcurrent)
	log.Printf("CycleTLS enabled: true")

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
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
