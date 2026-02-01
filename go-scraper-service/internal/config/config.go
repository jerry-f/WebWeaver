package config

import (
	"os"
	"strconv"
	"time"
)

// Config 服务配置
type Config struct {
	// HTTP 服务端口
	HTTPPort string
	// 最大并发数
	MaxConcurrent int
	// 请求超时时间
	RequestTimeout time.Duration
	// 连接池大小
	MaxIdleConns int
	// 每个主机的最大连接数
	MaxConnsPerHost int
	// User-Agent
	UserAgent string
	// Browserless 地址（用于回退）
	BrowserlessURL string
	// Redis URL（用于队列消费）
	RedisURL string
}

// DefaultConfig 默认配置
func DefaultConfig() *Config {
	return &Config{
		HTTPPort:        getEnv("HTTP_PORT", "8080"),
		MaxConcurrent:   getEnvInt("MAX_CONCURRENT", 100),
		RequestTimeout:  time.Duration(getEnvInt("REQUEST_TIMEOUT_MS", 15000)) * time.Millisecond,
		MaxIdleConns:    getEnvInt("MAX_IDLE_CONNS", 100),
		MaxConnsPerHost: getEnvInt("MAX_CONNS_PER_HOST", 10),
		UserAgent:       getEnv("USER_AGENT", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
		BrowserlessURL:  getEnv("BROWSERLESS_URL", "http://browserless:3000"),
		RedisURL:        getEnv("REDIS_URL", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
