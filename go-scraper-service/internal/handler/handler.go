package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/newsflow/go-scraper-service/internal/config"
	"github.com/newsflow/go-scraper-service/internal/extractor"
	"github.com/newsflow/go-scraper-service/internal/fetcher"
	"github.com/newsflow/go-scraper-service/internal/processor"
)

// Handler HTTP 处理器
type Handler struct {
	fetcher   *fetcher.Fetcher
	extractor *extractor.Extractor
	semaphore chan struct{}
	config    *config.Config
}

// FetchRequest 抓取请求
type FetchRequest struct {
	URL      string            `json:"url"`
	Referer  string            `json:"referer,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Timeout  int               `json:"timeout,omitempty"`
	Strategy string            `json:"strategy,omitempty"` // cycletls, standard, auto
}

// FetchResponse 抓取响应
type FetchResponse struct {
	URL         string            `json:"url"`
	FinalURL    string            `json:"finalUrl"`
	Title       string            `json:"title,omitempty"`
	Content     string            `json:"content,omitempty"`
	TextContent string            `json:"textContent,omitempty"`
	Excerpt     string            `json:"excerpt,omitempty"`
	Byline      string            `json:"byline,omitempty"`
	SiteName    string            `json:"siteName,omitempty"`
	Images      []processor.Image `json:"images,omitempty"`
	ReadingTime int               `json:"readingTime,omitempty"`
	Strategy    string            `json:"strategy"`
	Duration    int64             `json:"duration"`
	Error       string            `json:"error,omitempty"`
}

// RawFetchResponse 原始抓取响应（不经过 Readability 处理）
type RawFetchResponse struct {
	URL         string `json:"url"`
	FinalURL    string `json:"finalUrl"`
	Body        string `json:"body"`                  // 原始 HTML/XML 内容
	ContentType string `json:"contentType,omitempty"` // 响应的 Content-Type
	StatusCode  int    `json:"statusCode"`            // HTTP 状态码
	Strategy    string `json:"strategy"`
	Duration    int64  `json:"duration"`
	Error       string `json:"error,omitempty"`
}

// BatchRequest 批量抓取请求
type BatchRequest struct {
	URLs        []string `json:"urls"`
	Concurrency int      `json:"concurrency,omitempty"`
	Timeout     int      `json:"timeout,omitempty"`
}

// BatchResponse 批量抓取响应
type BatchResponse struct {
	Results  []FetchResponse `json:"results"`
	Duration int64           `json:"duration"`
}

// HealthResponse 健康检查响应
type HealthResponse struct {
	Status          string `json:"status"`
	Concurrency     int    `json:"concurrency"`
	Available       int    `json:"available"`
	CycleTLSEnabled bool   `json:"cycleTlsEnabled"`
}

// New 创建处理器
func New(cfg *config.Config) (*Handler, error) {
	f, err := fetcher.New(cfg)
	if err != nil {
		return nil, err
	}

	return &Handler{
		fetcher:   f,
		extractor: extractor.New(),
		semaphore: make(chan struct{}, cfg.MaxConcurrent),
		config:    cfg,
	}, nil
}

// RegisterRoutes 注册路由
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.handleHealth)
	mux.HandleFunc("/fetch", h.handleFetch)
	mux.HandleFunc("/fetch-raw", h.handleFetchRaw)
	mux.HandleFunc("/batch", h.handleBatch)
}

// handleHealth 健康检查
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	available := h.config.MaxConcurrent - len(h.semaphore)
	resp := HealthResponse{
		Status:          "ok",
		Concurrency:     h.config.MaxConcurrent,
		Available:       available,
		CycleTLSEnabled: true,
	}
	h.writeJSON(w, http.StatusOK, resp)
}

// handleFetch 单个抓取
func (h *Handler) handleFetch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req FetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.URL == "" {
		h.writeError(w, http.StatusBadRequest, "URL is required")
		return
	}

	// 获取信号量
	select {
	case h.semaphore <- struct{}{}:
		defer func() { <-h.semaphore }()
	default:
		h.writeError(w, http.StatusServiceUnavailable, "Server is busy")
		return
	}

	// 设置超时
	timeout := time.Duration(req.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = h.config.RequestTimeout
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	// 执行抓取
	resp := h.fetchAndExtract(ctx, req)
	h.writeJSON(w, http.StatusOK, resp)
}

// handleFetchRaw 原始抓取（不经过 Readability 处理）
// 用于 RSS/Scrape 列表页抓取，只需要原始 HTML/XML
func (h *Handler) handleFetchRaw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req FetchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.URL == "" {
		h.writeError(w, http.StatusBadRequest, "URL is required")
		return
	}

	// 获取信号量
	select {
	case h.semaphore <- struct{}{}:
		defer func() { <-h.semaphore }()
	default:
		h.writeError(w, http.StatusServiceUnavailable, "Server is busy")
		return
	}

	// 设置超时
	timeout := time.Duration(req.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = h.config.RequestTimeout
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	// 执行原始抓取
	resp := h.fetchRaw(ctx, req)
	h.writeJSON(w, http.StatusOK, resp)
}

// fetchRaw 只抓取原始内容，不进行 Readability 解析
func (h *Handler) fetchRaw(ctx context.Context, req FetchRequest) RawFetchResponse {
	start := time.Now()
	resp := RawFetchResponse{URL: req.URL, StatusCode: 200}

	// 根据策略和参数选择抓取方式
	var fetchResult *fetcher.FetchResult
	if len(req.Headers) > 0 {
		fetchResult = h.fetcher.FetchWithHeaders(ctx, req.URL, req.Headers)
	} else if req.Strategy != "" {
		fetchResult = h.fetcher.FetchWithStrategy(ctx, req.URL, req.Strategy)
	} else if req.Referer != "" {
		fetchResult = h.fetcher.FetchWithReferer(ctx, req.URL, req.Referer)
	} else {
		fetchResult = h.fetcher.Fetch(ctx, req.URL)
	}

	resp.Strategy = fetchResult.Strategy

	if fetchResult.Error != nil {
		resp.Error = fetchResult.Error.Error()
		resp.StatusCode = 0
		resp.Duration = time.Since(start).Milliseconds()
		return resp
	}

	resp.FinalURL = fetchResult.FinalURL
	resp.Body = fetchResult.HTML
	resp.ContentType = fetchResult.ContentType
	resp.StatusCode = fetchResult.StatusCode
	resp.Duration = time.Since(start).Milliseconds()

	return resp
}

// handleBatch 批量抓取
func (h *Handler) handleBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.URLs) == 0 {
		h.writeError(w, http.StatusBadRequest, "URLs is required")
		return
	}

	if len(req.URLs) > 100 {
		h.writeError(w, http.StatusBadRequest, "Maximum 100 URLs per batch")
		return
	}

	start := time.Now()
	concurrency := req.Concurrency
	if concurrency <= 0 || concurrency > 10 {
		concurrency = 5
	}

	timeout := time.Duration(req.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	results := h.batchFetch(ctx, req.URLs, concurrency)

	resp := BatchResponse{
		Results:  results,
		Duration: time.Since(start).Milliseconds(),
	}
	h.writeJSON(w, http.StatusOK, resp)
}

// fetchAndExtract 抓取并提取内容
func (h *Handler) fetchAndExtract(ctx context.Context, req FetchRequest) FetchResponse {
	start := time.Now()
	resp := FetchResponse{URL: req.URL}

	// 根据策略和参数选择抓取方式
	var fetchResult *fetcher.FetchResult
	if len(req.Headers) > 0 {
		// 有自定义 Headers（包括 Cookie），使用带 Headers 的方法
		fetchResult = h.fetcher.FetchWithHeaders(ctx, req.URL, req.Headers)
	} else if req.Strategy != "" {
		fetchResult = h.fetcher.FetchWithStrategy(ctx, req.URL, req.Strategy)
	} else if req.Referer != "" {
		fetchResult = h.fetcher.FetchWithReferer(ctx, req.URL, req.Referer)
	} else {
		fetchResult = h.fetcher.Fetch(ctx, req.URL)
	}

	resp.Strategy = fetchResult.Strategy

	if fetchResult.Error != nil {
		resp.Error = fetchResult.Error.Error()
		resp.Duration = time.Since(start).Milliseconds()
		return resp
	}

	resp.FinalURL = fetchResult.FinalURL

	// 提取内容
	extractResult, err := h.extractor.Extract(fetchResult.HTML, fetchResult.FinalURL)
	if err != nil {
		resp.Error = err.Error()
		resp.Duration = time.Since(start).Milliseconds()
		return resp
	}

	resp.Title = extractResult.Title
	resp.Content = extractResult.Content
	resp.TextContent = extractResult.TextContent
	resp.Excerpt = extractResult.Excerpt
	resp.Byline = extractResult.Byline
	resp.SiteName = extractResult.SiteName
	resp.Images = extractResult.Images
	resp.ReadingTime = extractResult.ReadingTime
	resp.Duration = time.Since(start).Milliseconds()

	return resp
}

// batchFetch 批量抓取
func (h *Handler) batchFetch(ctx context.Context, urls []string, concurrency int) []FetchResponse {
	results := make([]FetchResponse, len(urls))
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i, url := range urls {
		wg.Add(1)
		go func(idx int, u string) {
			defer wg.Done()

			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				results[idx] = FetchResponse{URL: u, Error: "context cancelled"}
				return
			}

			select {
			case h.semaphore <- struct{}{}:
				defer func() { <-h.semaphore }()
			case <-ctx.Done():
				results[idx] = FetchResponse{URL: u, Error: "context cancelled"}
				return
			}

			results[idx] = h.fetchAndExtract(ctx, FetchRequest{URL: u})
		}(i, url)
	}

	wg.Wait()
	return results
}

// Close 关闭处理器
func (h *Handler) Close() {
	h.fetcher.Close()
}

func (h *Handler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (h *Handler) writeError(w http.ResponseWriter, status int, message string) {
	h.writeJSON(w, status, map[string]string{"error": message})
}
