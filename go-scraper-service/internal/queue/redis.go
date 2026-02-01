package queue

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// FetchTask 抓取任务
type FetchTask struct {
	ID        string            `json:"id"`
	URL       string            `json:"url"`
	ArticleID string            `json:"articleId,omitempty"`
	SourceID  string            `json:"sourceId,omitempty"`
	Priority  int               `json:"priority"`
	Strategy  string            `json:"strategy,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Referer   string            `json:"referer,omitempty"`
	CreatedAt time.Time         `json:"createdAt"`
}

// FetchResult 抓取结果
type FetchResult struct {
	TaskID      string `json:"taskId"`
	URL         string `json:"url"`
	ArticleID   string `json:"articleId,omitempty"`
	Success     bool   `json:"success"`
	Content     string `json:"content,omitempty"`
	TextContent string `json:"textContent,omitempty"`
	Title       string `json:"title,omitempty"`
	Strategy    string `json:"strategy"`
	Duration    int64  `json:"duration"`
	Error       string `json:"error,omitempty"`
}

// RedisQueue Redis 队列消费者
type RedisQueue struct {
	client       *redis.Client
	taskQueue    string
	resultQueue  string
	consumerName string
}

// NewRedisQueue 创建 Redis 队列
func NewRedisQueue(redisURL, consumerName string) (*RedisQueue, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opt)

	// 测试连接
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &RedisQueue{
		client:       client,
		taskQueue:    "newsflow:fetch_tasks",
		resultQueue:  "newsflow:fetch_results",
		consumerName: consumerName,
	}, nil
}

// ConsumeTask 消费任务（阻塞式）
func (q *RedisQueue) ConsumeTask(ctx context.Context) (*FetchTask, error) {
	// 使用 BLPOP 阻塞等待任务
	result, err := q.client.BLPop(ctx, 30*time.Second, q.taskQueue).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // 超时，无任务
		}
		return nil, err
	}

	if len(result) < 2 {
		return nil, nil
	}

	var task FetchTask
	if err := json.Unmarshal([]byte(result[1]), &task); err != nil {
		return nil, err
	}

	return &task, nil
}

// PublishResult 发布结果
func (q *RedisQueue) PublishResult(ctx context.Context, result *FetchResult) error {
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return q.client.RPush(ctx, q.resultQueue, data).Err()
}

// Close 关闭连接
func (q *RedisQueue) Close() error {
	return q.client.Close()
}

// TaskHandler 任务处理函数
type TaskHandler func(ctx context.Context, task *FetchTask) *FetchResult

// StartConsumer 启动消费者
func (q *RedisQueue) StartConsumer(ctx context.Context, handler TaskHandler, concurrency int) {
	sem := make(chan struct{}, concurrency)

	for {
		select {
		case <-ctx.Done():
			log.Println("Queue consumer stopped")
			return
		default:
		}

		task, err := q.ConsumeTask(ctx)
		if err != nil {
			log.Printf("Error consuming task: %v", err)
			time.Sleep(time.Second)
			continue
		}

		if task == nil {
			continue
		}

		// 获取并发控制信号量
		sem <- struct{}{}

		go func(t *FetchTask) {
			defer func() { <-sem }()

			result := handler(ctx, t)
			if err := q.PublishResult(ctx, result); err != nil {
				log.Printf("Error publishing result: %v", err)
			}
		}(task)
	}
}

// GetQueueLength 获取队列长度
func (q *RedisQueue) GetQueueLength(ctx context.Context) (int64, error) {
	return q.client.LLen(ctx, q.taskQueue).Result()
}
