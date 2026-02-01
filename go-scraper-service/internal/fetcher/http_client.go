package fetcher

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/newsflow/go-scraper-service/internal/config"
)

// StandardClient 标准 HTTP 客户端（备用）
type StandardClient struct {
	client    *http.Client
	userAgent string
}

// NewStandardClient 创建标准 HTTP 客户端
func NewStandardClient(cfg *config.Config) *StandardClient {
	transport := &http.Transport{
		MaxIdleConns:        cfg.MaxIdleConns,
		MaxIdleConnsPerHost: cfg.MaxConnsPerHost,
		MaxConnsPerHost:     cfg.MaxConnsPerHost,
		IdleConnTimeout:     90 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		TLSHandshakeTimeout:   10 * time.Second,
		DisableCompression:    false,
		ResponseHeaderTimeout: 10 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   cfg.RequestTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	return &StandardClient{
		client:    client,
		userAgent: cfg.UserAgent,
	}
}

// Fetch 使用标准客户端抓取
func (c *StandardClient) Fetch(ctx context.Context, url string) *FetchResult {
	start := time.Now()
	result := &FetchResult{URL: url, Strategy: "standard"}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Accept-Encoding", "gzip, deflate")
	req.Header.Set("Connection", "keep-alive")

	resp, err := c.client.Do(req)
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}
	defer resp.Body.Close()

	result.FinalURL = resp.Request.URL.String()

	if resp.StatusCode != http.StatusOK {
		result.Error = &HTTPError{StatusCode: resp.StatusCode}
		result.Duration = time.Since(start)
		return result
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}

	result.HTML = string(body)
	result.Duration = time.Since(start)
	return result
}
