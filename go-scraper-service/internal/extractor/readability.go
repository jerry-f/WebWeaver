package extractor

import (
	"net/url"
	"strings"

	"github.com/go-shiori/go-readability"
)

// ReadabilityResult Readability 提取结果
type ReadabilityResult struct {
	Title       string
	Content     string // HTML 格式
	TextContent string // 纯文本
	Excerpt     string
	Byline      string
	SiteName    string
	Length      int
}

// ExtractWithReadability 使用 go-readability 提取正文
func ExtractWithReadability(html, pageURL string) (*ReadabilityResult, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return nil, err
	}

	article, err := readability.FromReader(strings.NewReader(html), parsedURL)
	if err != nil {
		return nil, err
	}

	return &ReadabilityResult{
		Title:       article.Title,
		Content:     article.Content,
		TextContent: strings.TrimSpace(article.TextContent),
		Excerpt:     article.Excerpt,
		Byline:      article.Byline,
		SiteName:    article.SiteName,
		Length:      article.Length,
	}, nil
}
