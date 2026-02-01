package processor

import (
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// Image 图片信息
type Image struct {
	OriginalURL string `json:"originalUrl"`
	ProxyURL    string `json:"proxyUrl,omitempty"`
	Alt         string `json:"alt,omitempty"`
	IsLazy      bool   `json:"isLazy"`
}

// ImageProcessor 图片处理器
type ImageProcessor struct {
	lazyAttributes []string
	proxyBaseURL   string
	enableProxy    bool
}

// NewImageProcessor 创建图片处理器
func NewImageProcessor() *ImageProcessor {
	return &ImageProcessor{
		lazyAttributes: []string{
			"data-src",
			"data-lazy-src",
			"data-original",
			"data-actualsrc",
			"data-hi-res-src",
			"data-lazy",
			"data-echo",
		},
		proxyBaseURL: "/api/image-proxy",
		enableProxy:  false,
	}
}

// ProcessLazyImages 处理懒加载图片（在 Readability 之前调用）
func (p *ImageProcessor) ProcessLazyImages(html string) string {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return html
	}

	doc.Find("img").Each(func(i int, s *goquery.Selection) {
		// 检查懒加载属性
		for _, attr := range p.lazyAttributes {
			if lazySrc, exists := s.Attr(attr); exists && lazySrc != "" {
				if strings.HasPrefix(lazySrc, "http") || strings.HasPrefix(lazySrc, "/") {
					s.SetAttr("src", lazySrc)
					break
				}
			}
		}

		// 处理 data-srcset
		if dataSrcset, exists := s.Attr("data-srcset"); exists {
			s.SetAttr("srcset", dataSrcset)
		}
	})

	result, _ := doc.Html()
	return result
}

// ProcessImages 处理提取后的图片（URL 绝对化、添加属性）
func (p *ImageProcessor) ProcessImages(html string, baseURL *url.URL) (string, []Image) {
	var images []Image

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return html, images
	}

	doc.Find("img").Each(func(i int, s *goquery.Selection) {
		src, exists := s.Attr("src")
		if !exists || src == "" || strings.HasPrefix(src, "data:") {
			return
		}

		// 转换为绝对 URL
		absoluteURL := resolveURL(src, baseURL)
		s.SetAttr("src", absoluteURL)

		// 添加懒加载属性
		s.SetAttr("loading", "lazy")
		s.SetAttr("decoding", "async")

		// 检测是否为懒加载图片
		isLazy := false
		for _, attr := range p.lazyAttributes {
			if _, exists := s.Attr(attr); exists {
				isLazy = true
				break
			}
		}

		// 获取 alt 文本
		alt, _ := s.Attr("alt")

		// 生成代理 URL（如果启用）
		proxyURL := ""
		if p.enableProxy && strings.HasPrefix(absoluteURL, "http") {
			proxyURL = p.proxyBaseURL + "?url=" + url.QueryEscape(absoluteURL)
			s.SetAttr("src", proxyURL)
		}

		images = append(images, Image{
			OriginalURL: absoluteURL,
			ProxyURL:    proxyURL,
			Alt:         alt,
			IsLazy:      isLazy,
		})
	})

	result, _ := doc.Html()
	return result, images
}

// SetProxyConfig 设置代理配置
func (p *ImageProcessor) SetProxyConfig(enable bool, baseURL string) {
	p.enableProxy = enable
	if baseURL != "" {
		p.proxyBaseURL = baseURL
	}
}

func resolveURL(rawURL string, baseURL *url.URL) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	return baseURL.ResolveReference(parsed).String()
}
