package fetcher

import (
	"context"
	"time"

	"github.com/newsflow/go-scraper-service/internal/config"
)

// FetchResult 抓取结果
type FetchResult struct {
	URL      string
	FinalURL string
	HTML     string
	Strategy string // cycletls, standard, browserless
	Duration time.Duration
	Error    error
}

// HTTPError HTTP 错误
type HTTPError struct {
	StatusCode int
}

func (e *HTTPError) Error() string {
	return "HTTP error"
}

// Fetcher 统一抓取器（整合多种策略）
type Fetcher struct {
	cycleTLS *CycleTLSClient
	standard *StandardClient
	config   *config.Config
}

// New 创建抓取器
func New(cfg *config.Config) (*Fetcher, error) {
	// 创建 CycleTLS 客户端
	cycleTLS, err := NewCycleTLSClient(cfg)
	if err != nil {
		// CycleTLS 失败，使用标准客户端
		return &Fetcher{
			standard: NewStandardClient(cfg),
			config:   cfg,
		}, nil
	}

	return &Fetcher{
		cycleTLS: cycleTLS,
		standard: NewStandardClient(cfg),
		config:   cfg,
	}, nil
}

// Fetch 抓取页面（优先 CycleTLS，失败回退到标准客户端）
func (f *Fetcher) Fetch(ctx context.Context, url string) *FetchResult {
	// 优先使用 CycleTLS（TLS 指纹伪造）
	if f.cycleTLS != nil {
		result := f.cycleTLS.Fetch(ctx, url)
		if result.Error == nil && result.HTML != "" {
			return result
		}
		// CycleTLS 失败，回退到标准客户端
	}

	// 使用标准 HTTP 客户端
	return f.standard.Fetch(ctx, url)
}

// FetchWithReferer 带 Referer 抓取
func (f *Fetcher) FetchWithReferer(ctx context.Context, url, referer string) *FetchResult {
	if f.cycleTLS != nil {
		result := f.cycleTLS.FetchWithReferer(ctx, url, referer)
		if result.Error == nil && result.HTML != "" {
			return result
		}
	}

	// 标准客户端不支持 Referer，使用基本抓取
	return f.standard.Fetch(ctx, url)
}

// FetchWithStrategy 指定策略抓取
func (f *Fetcher) FetchWithStrategy(ctx context.Context, url, strategy string) *FetchResult {
	switch strategy {
	case "cycletls":
		if f.cycleTLS != nil {
			return f.cycleTLS.Fetch(ctx, url)
		}
		return f.standard.Fetch(ctx, url)
	case "standard":
		return f.standard.Fetch(ctx, url)
	default:
		return f.Fetch(ctx, url)
	}
}

// FetchWithHeaders 带自定义 Headers 抓取（支持 Cookie）
func (f *Fetcher) FetchWithHeaders(ctx context.Context, url string, headers map[string]string) *FetchResult {
	// 优先使用 CycleTLS（TLS 指纹伪造 + Cookie）
	if f.cycleTLS != nil {
		result := f.cycleTLS.FetchWithHeaders(ctx, url, headers)
		if result.Error == nil && result.HTML != "" {
			return result
		}
		// CycleTLS 失败，回退到标准客户端（带 Headers）
	}

	// 使用标准 HTTP 客户端（带 Headers）
	return f.standard.FetchWithHeaders(ctx, url, headers)
}

// Close 关闭抓取器
func (f *Fetcher) Close() {
	if f.cycleTLS != nil {
		f.cycleTLS.Close()
	}
}
