package extractor

import (
	"github.com/microcosm-cc/bluemonday"
)

// Sanitizer HTML 净化器
type Sanitizer struct {
	policy *bluemonday.Policy
}

// NewSanitizer 创建净化器
func NewSanitizer() *Sanitizer {
	policy := bluemonday.NewPolicy()

	// 允许的标签（保留文章排版）
	policy.AllowElements(
		// 文本结构
		"p", "br", "hr", "div", "span",
		// 标题
		"h1", "h2", "h3", "h4", "h5", "h6",
		// 列表
		"ul", "ol", "li", "dl", "dt", "dd",
		// 文本格式
		"b", "i", "strong", "em", "u", "s", "strike", "del", "ins",
		"sub", "sup", "small", "mark", "abbr",
		// 引用和代码
		"blockquote", "pre", "code", "kbd", "samp", "var",
		// 媒体
		"figure", "figcaption", "picture", "source",
		// 表格
		"table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td",
		// 其他
		"address", "cite", "q", "time", "details", "summary",
	)

	// 链接
	policy.AllowAttrs("href", "target", "rel").OnElements("a")
	policy.AllowRelativeURLs(false)
	policy.RequireNoFollowOnLinks(true)

	// 图片
	policy.AllowAttrs("src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding").OnElements("img")

	// 表格
	policy.AllowAttrs("colspan", "rowspan", "scope").OnElements("th", "td")

	// 时间
	policy.AllowAttrs("datetime").OnElements("time")

	return &Sanitizer{policy: policy}
}

// Sanitize 净化 HTML
func (s *Sanitizer) Sanitize(html string) string {
	return s.policy.Sanitize(html)
}

// 默认净化器实例
var defaultSanitizer = NewSanitizer()

// SanitizeHTML 使用默认净化器净化 HTML
func SanitizeHTML(html string) string {
	return defaultSanitizer.Sanitize(html)
}
