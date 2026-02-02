package extractor

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/newsflow/go-scraper-service/internal/processor"
)

// ExtractResult 提取结果
type ExtractResult struct {
	Content     string            `json:"content"`
	TextContent string            `json:"textContent"`
	Title       string            `json:"title"`
	Excerpt     string            `json:"excerpt"`
	Byline      string            `json:"byline"`
	SiteName    string            `json:"siteName"`
	Images      []processor.Image `json:"images"`
	ReadingTime int               `json:"readingTime"`
}

// Extractor 内容提取器（整合 readability + sanitizer + image processor）
type Extractor struct {
	sanitizer      *Sanitizer
	imageProcessor *processor.ImageProcessor
}

// New 创建提取器
func New() *Extractor {
	return &Extractor{
		sanitizer:      NewSanitizer(),
		imageProcessor: processor.NewImageProcessor(),
	}
}

// Extract 提取文章内容
//
// 对原始 HTML 进行完整的内容提取处理流程：
//  1. Cloudflare Email Protection 解码 - 还原被混淆的邮箱地址
//  2. 懒加载图片预处理 - 将 data-src 等属性转换为 src
//  3. Readability 正文提取 - 使用 Mozilla Readability 算法提取文章主体
//  4. 图片 URL 处理 - 转换为绝对 URL，添加懒加载属性
//  5. HTML 净化 - 移除不安全的标签和属性
//  6. 阅读时间计算 - 根据中英文字数估算
//
// 参数：
//   - html: 原始 HTML 字符串
//   - pageURL: 页面 URL（用于解析相对链接）
//
// 返回：
//   - *ExtractResult: 提取结果，包含净化后的内容、标题、摘要等
//   - error: 处理过程中的错误
func (e *Extractor) Extract(html, pageURL string) (*ExtractResult, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return nil, err
	}


	// 0. 解码 Cloudflare Email Protection 混淆的邮箱
	// Cloudflare 会将 mailto: 链接和邮箱文本替换为 /cdn-cgi/l/email-protection#... 格式
	// 静态抓取无法执行 JS 解码，需要手动还原
	html = DecodeCloudflareEmails(html)

	// 1. 预处理懒加载图片
	preprocessedHTML := e.imageProcessor.ProcessLazyImages(html)

	// 2. 使用 Readability 提取正文
	article, err := ExtractWithReadability(preprocessedHTML, pageURL)
	if err != nil {
		return nil, err
	}

	// 3. 处理图片（URL 绝对化）
	processedHTML, images := e.imageProcessor.ProcessImages(article.Content, parsedURL)

	// 4. HTML 净化
	sanitizedHTML := e.sanitizer.Sanitize(processedHTML)

	// 5. 计算阅读时间
	readingTime := calculateReadingTime(article.TextContent)

	return &ExtractResult{
		Content:     sanitizedHTML,
		TextContent: article.TextContent,
		Title:       article.Title,
		Excerpt:     article.Excerpt,
		Byline:      article.Byline,
		SiteName:    article.SiteName,
		Images:      images,
		ReadingTime: readingTime,
	}, nil
}

// SetImageProxyConfig 设置图片代理配置
func (e *Extractor) SetImageProxyConfig(enable bool, baseURL string) {
	e.imageProcessor.SetProxyConfig(enable, baseURL)
}

// calculateReadingTime 计算阅读时间（分钟）
func calculateReadingTime(text string) int {
	// 中文约 400 字/分钟，英文约 200 词/分钟
	chineseCount := len(regexp.MustCompile(`[\p{Han}]`).FindAllString(text, -1))
	wordCount := len(strings.Fields(text))

	minutes := float64(chineseCount)/400.0 + float64(wordCount)/200.0

	if minutes < 1 {
		return 1
	}
	return int(minutes + 0.5)
}
