package grpc

import (
	"context"
	"io"
	"time"

	pb "github.com/newsflow/go-scraper-service/api/proto/gen"
	"github.com/newsflow/go-scraper-service/internal/config"
	"github.com/newsflow/go-scraper-service/internal/extractor"
	"github.com/newsflow/go-scraper-service/internal/fetcher"
	"github.com/newsflow/go-scraper-service/internal/processor"
)

// ScraperServer gRPC 服务实现
type ScraperServer struct {
	pb.UnimplementedScraperServiceServer
	fetcher   *fetcher.Fetcher
	extractor *extractor.Extractor
	semaphore chan struct{}
	config    *config.Config
}

// NewScraperServer 创建 gRPC 服务
func NewScraperServer(cfg *config.Config) (*ScraperServer, error) {
	f, err := fetcher.New(cfg)
	if err != nil {
		return nil, err
	}

	return &ScraperServer{
		fetcher:   f,
		extractor: extractor.New(),
		semaphore: make(chan struct{}, cfg.MaxConcurrent),
		config:    cfg,
	}, nil
}

// FetchArticle 抓取单个文章
func (s *ScraperServer) FetchArticle(ctx context.Context, req *pb.FetchRequest) (*pb.FetchResponse, error) {
	// 获取信号量
	select {
	case s.semaphore <- struct{}{}:
		defer func() { <-s.semaphore }()
	case <-ctx.Done():
		return &pb.FetchResponse{
			Url:   req.Url,
			Error: "context cancelled",
		}, nil
	default:
		return &pb.FetchResponse{
			Url:   req.Url,
			Error: "server is busy",
		}, nil
	}

	return s.fetchAndExtract(ctx, req), nil
}

// FetchArticles 批量抓取（流式）
func (s *ScraperServer) FetchArticles(stream pb.ScraperService_FetchArticlesServer) error {
	for {
		req, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		// 获取信号量
		select {
		case s.semaphore <- struct{}{}:
		case <-stream.Context().Done():
			return stream.Context().Err()
		}

		resp := s.fetchAndExtract(stream.Context(), req)
		<-s.semaphore

		if err := stream.Send(resp); err != nil {
			return err
		}
	}
}

// HealthCheck 健康检查
func (s *ScraperServer) HealthCheck(ctx context.Context, req *pb.Empty) (*pb.HealthResponse, error) {
	available := s.config.MaxConcurrent - len(s.semaphore)
	return &pb.HealthResponse{
		Status:          "ok",
		MaxConcurrent:   int32(s.config.MaxConcurrent),
		Available:       int32(available),
		CycletlsEnabled: true,
	}, nil
}

// FetchRaw 原始抓取（不经过 Readability 处理）
func (s *ScraperServer) FetchRaw(ctx context.Context, req *pb.FetchRequest) (*pb.FetchRawResponse, error) {
	// 获取信号量
	select {
	case s.semaphore <- struct{}{}:
		defer func() { <-s.semaphore }()
	case <-ctx.Done():
		return &pb.FetchRawResponse{
			Url:   req.Url,
			Error: "context cancelled",
		}, nil
	default:
		return &pb.FetchRawResponse{
			Url:   req.Url,
			Error: "server is busy",
		}, nil
	}

	return s.fetchRawContent(ctx, req), nil
}

// fetchRawContent 抓取原始内容（不提取正文）
func (s *ScraperServer) fetchRawContent(ctx context.Context, req *pb.FetchRequest) *pb.FetchRawResponse {
	start := time.Now()
	resp := &pb.FetchRawResponse{Url: req.Url}

	// 设置超时
	timeout := s.config.RequestTimeout
	if req.Options != nil && req.Options.TimeoutMs > 0 {
		timeout = time.Duration(req.Options.TimeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 根据策略抓取
	var fetchResult *fetcher.FetchResult
	strategy := ""
	if req.Options != nil {
		strategy = req.Options.Strategy
	}

	if strategy != "" {
		fetchResult = s.fetcher.FetchWithStrategy(ctx, req.Url, strategy)
	} else if req.Options != nil && req.Options.Referer != "" {
		fetchResult = s.fetcher.FetchWithReferer(ctx, req.Url, req.Options.Referer)
	} else {
		fetchResult = s.fetcher.Fetch(ctx, req.Url)
	}

	resp.Strategy = fetchResult.Strategy
	resp.DurationMs = time.Since(start).Milliseconds()

	if fetchResult.Error != nil {
		resp.Error = fetchResult.Error.Error()
		return resp
	}

	resp.FinalUrl = fetchResult.FinalURL
	resp.Body = fetchResult.HTML
	resp.ContentType = fetchResult.ContentType
	resp.StatusCode = int32(fetchResult.StatusCode)

	return resp
}

// fetchAndExtract 抓取并提取内容
func (s *ScraperServer) fetchAndExtract(ctx context.Context, req *pb.FetchRequest) *pb.FetchResponse {
	start := time.Now()
	resp := &pb.FetchResponse{Url: req.Url}

	// 设置超时
	timeout := s.config.RequestTimeout
	if req.Options != nil && req.Options.TimeoutMs > 0 {
		timeout = time.Duration(req.Options.TimeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 根据策略抓取
	var fetchResult *fetcher.FetchResult
	strategy := ""
	if req.Options != nil {
		strategy = req.Options.Strategy
	}

	if strategy != "" {
		fetchResult = s.fetcher.FetchWithStrategy(ctx, req.Url, strategy)
	} else if req.Options != nil && req.Options.Referer != "" {
		fetchResult = s.fetcher.FetchWithReferer(ctx, req.Url, req.Options.Referer)
	} else {
		fetchResult = s.fetcher.Fetch(ctx, req.Url)
	}

	resp.Strategy = fetchResult.Strategy

	if fetchResult.Error != nil {
		resp.Error = fetchResult.Error.Error()
		resp.DurationMs = time.Since(start).Milliseconds()
		return resp
	}

	resp.FinalUrl = fetchResult.FinalURL

	// 提取内容
	extractResult, err := s.extractor.Extract(fetchResult.HTML, fetchResult.FinalURL)
	if err != nil {
		resp.Error = err.Error()
		resp.DurationMs = time.Since(start).Milliseconds()
		return resp
	}

	resp.Title = extractResult.Title
	resp.Content = extractResult.Content
	resp.TextContent = extractResult.TextContent
	resp.Excerpt = extractResult.Excerpt
	resp.Byline = extractResult.Byline
	resp.SiteName = extractResult.SiteName
	resp.ReadingTime = int32(extractResult.ReadingTime)
	resp.DurationMs = time.Since(start).Milliseconds()

	// 转换图片
	resp.Images = convertImages(extractResult.Images)

	return resp
}

// convertImages 转换图片格式
func convertImages(images []processor.Image) []*pb.Image {
	result := make([]*pb.Image, len(images))
	for i, img := range images {
		result[i] = &pb.Image{
			OriginalUrl: img.OriginalURL,
			ProxyUrl:    img.ProxyURL,
			Alt:         img.Alt,
			IsLazy:      img.IsLazy,
		}
	}
	return result
}

// Close 关闭服务
func (s *ScraperServer) Close() {
	s.fetcher.Close()
}
