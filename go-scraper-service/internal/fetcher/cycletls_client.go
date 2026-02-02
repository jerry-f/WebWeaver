package fetcher

import (
	"context"
	"time"

	cycletls "github.com/Danny-Dasilva/CycleTLS/cycletls"
	"github.com/newsflow/go-scraper-service/internal/config"
)

// CycleTLSClient 使用 CycleTLS 的客户端（TLS 指纹伪造）
type CycleTLSClient struct {
	client    cycletls.CycleTLS
	userAgent string
	ja3       string
	timeout   int
}

// Chrome JA3 指纹
const ChromeJA3 = "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0"

// NewCycleTLSClient 创建 CycleTLS 客户端
func NewCycleTLSClient(cfg *config.Config) (*CycleTLSClient, error) {
	client := cycletls.Init()

	return &CycleTLSClient{
		client:    client,
		userAgent: cfg.UserAgent,
		ja3:       ChromeJA3,
		timeout:   int(cfg.RequestTimeout.Seconds()),
	}, nil
}

// Fetch 使用 CycleTLS 抓取（模拟 Chrome TLS 指纹）
func (c *CycleTLSClient) Fetch(ctx context.Context, url string) *FetchResult {
	start := time.Now()
	result := &FetchResult{URL: url, Strategy: "cycletls"}

	// 构建请求选项
	options := cycletls.Options{
		Body:      "",
		Ja3:       c.ja3,
		UserAgent: c.userAgent,
		Headers: map[string]string{
			"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			"Accept-Encoding": "gzip, deflate, br",
			"Connection":      "keep-alive",
			"Cache-Control":   "no-cache",
		},
		Timeout: c.timeout,
	}

	// 执行请求
	resp, err := c.client.Do(url, options, "GET")
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}

	result.FinalURL = resp.FinalUrl
	if result.FinalURL == "" {
		result.FinalURL = url
	}
	result.StatusCode = resp.Status

	// 提取 Content-Type
	if ct, ok := resp.Headers["Content-Type"]; ok {
		result.ContentType = ct
	}

	if resp.Status != 200 {
		result.Error = &HTTPError{StatusCode: resp.Status}
		result.Duration = time.Since(start)
		return result
	}

	result.HTML = resp.Body
	result.Duration = time.Since(start)
	return result
}

// FetchWithReferer 带 Referer 抓取
func (c *CycleTLSClient) FetchWithReferer(ctx context.Context, url, referer string) *FetchResult {
	start := time.Now()
	result := &FetchResult{URL: url, Strategy: "cycletls"}

	options := cycletls.Options{
		Body:      "",
		Ja3:       c.ja3,
		UserAgent: c.userAgent,
		Headers: map[string]string{
			"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			"Accept-Encoding": "gzip, deflate, br",
			"Referer":         referer,
		},
		Timeout: c.timeout,
	}

	resp, err := c.client.Do(url, options, "GET")
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}

	result.FinalURL = resp.FinalUrl
	if result.FinalURL == "" {
		result.FinalURL = url
	}
	result.StatusCode = resp.Status

	if ct, ok := resp.Headers["Content-Type"]; ok {
		result.ContentType = ct
	}

	if resp.Status != 200 {
		result.Error = &HTTPError{StatusCode: resp.Status}
		result.Duration = time.Since(start)
		return result
	}

	result.HTML = resp.Body
	result.Duration = time.Since(start)
	return result
}

// FetchWithHeaders 带自定义 Headers 抓取（支持 Cookie）
func (c *CycleTLSClient) FetchWithHeaders(ctx context.Context, url string, customHeaders map[string]string) *FetchResult {
	start := time.Now()
	result := &FetchResult{URL: url, Strategy: "cycletls"}

	// 合并默认 Headers 和自定义 Headers
	headers := map[string]string{
		"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Accept-Encoding": "gzip, deflate, br",
		"Connection":      "keep-alive",
		"Cache-Control":   "no-cache",
	}

	// 自定义 Headers 覆盖默认值
	for k, v := range customHeaders {
		headers[k] = v
	}

	options := cycletls.Options{
		Body:      "",
		Ja3:       c.ja3,
		UserAgent: c.userAgent,
		Headers:   headers,
		Timeout:   c.timeout,
	}

	resp, err := c.client.Do(url, options, "GET")
	if err != nil {
		result.Error = err
		result.Duration = time.Since(start)
		return result
	}

	result.FinalURL = resp.FinalUrl
	if result.FinalURL == "" {
		result.FinalURL = url
	}
	result.StatusCode = resp.Status

	if ct, ok := resp.Headers["Content-Type"]; ok {
		result.ContentType = ct
	}

	if resp.Status != 200 {
		result.Error = &HTTPError{StatusCode: resp.Status}
		result.Duration = time.Since(start)
		return result
	}

	result.HTML = resp.Body
	result.Duration = time.Since(start)
	return result
}

// Close 关闭客户端
func (c *CycleTLSClient) Close() {
	c.client.Close()
}
