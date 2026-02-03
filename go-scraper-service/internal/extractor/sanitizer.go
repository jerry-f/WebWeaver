// Package extractor 提供 HTML 内容提取和净化功能
//
// 本包使用 bluemonday 库进行 HTML 净化，确保输出的 HTML 安全且符合文章阅读需求。
// 净化策略与 Node.js 端的 DOMPurify 配置保持一致，确保跨平台内容处理的一致性。
package extractor

import (
	"github.com/microcosm-cc/bluemonday"
)

// Sanitizer HTML 净化器
//
// 使用 bluemonday 库实现 HTML 净化，移除潜在的 XSS 攻击向量，
// 同时保留文章排版所需的安全标签和属性。
//
// 主要功能：
//   - 白名单过滤：只允许预定义的安全标签和属性
//   - 链接安全：自动为外部链接添加 target="_blank" 和 rel="noopener noreferrer nofollow"
//   - URL 验证：禁止相对 URL，防止路径遍历攻击
//
// 与 Node.js 端 (html-sanitizer.ts) 的对应关系：
//   - Go: bluemonday.Policy       <-> Node.js: DOMPurify
//   - Go: AllowElements()         <-> Node.js: ALLOWED_TAGS
//   - Go: AllowAttrs().OnElements <-> Node.js: ALLOWED_ATTR
//   - Go: AddTargetBlankToFullyQualifiedLinks <-> Node.js: afterSanitizeAttributes hook
type Sanitizer struct {
	policy *bluemonday.Policy
}

// NewSanitizer 创建并配置 HTML 净化器
//
// 返回一个配置完整的 Sanitizer 实例，包含以下安全策略：
//
// 1. 允许的 HTML 标签（白名单模式）：
//   - 文本结构：p, br, hr, div, span
//   - 标题：h1-h6
//   - 列表：ul, ol, li, dl, dt, dd
//   - 文本格式：b, i, strong, em, u, s, strike, del, ins, sub, sup, small, mark, abbr
//   - 引用和代码：blockquote, pre, code, kbd, samp, var
//   - 媒体：a, img, figure, figcaption, picture, source
//   - 表格：table, caption, thead, tbody, tfoot, tr, th, td
//   - 其他：address, cite, q, time, details, summary
//
// 2. 链接安全配置：
//   - 允许 href, target, rel 属性
//   - 外部链接自动添加 target="_blank"（防止 tabnabbing 攻击）
//   - 外部链接自动添加 rel="noopener noreferrer nofollow"
//   - 禁止相对 URL（防止路径遍历）
//
// 3. 图片属性：
//   - 允许 src, srcset, sizes, alt, width, height, loading, decoding
//   - loading 和 decoding 属性支持懒加载优化（由 image.go 设置）
//
// 使用示例：
//
//	sanitizer := NewSanitizer()
//	cleanHTML := sanitizer.Sanitize(dirtyHTML)
func NewSanitizer() *Sanitizer {
	policy := bluemonday.NewPolicy()

	// ============================================================
	// 允许的标签（白名单模式，保留文章排版所需的语义化标签）
	// ============================================================
	policy.AllowElements(
		// 文本结构 - 段落和分隔
		"p", "br", "hr", "div", "span",
		// 标题 - 文章层级结构
		"h1", "h2", "h3", "h4", "h5", "h6",
		// 列表 - 有序/无序/定义列表
		"ul", "ol", "li", "dl", "dt", "dd",
		// 文本格式 - 强调、删除线、上下标等
		"b", "i", "strong", "em", "u", "s", "strike", "del", "ins",
		"sub", "sup", "small", "mark", "abbr",
		// 引用和代码 - 代码块、引用块
		"blockquote", "pre", "code", "kbd", "samp", "var",
		// 媒体 - 链接、图片、图片容器
		"a", "img", "figure", "figcaption", "picture", "source",
		// 表格 - 完整表格支持
		"table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td",
		// 其他语义化标签
		"address", "cite", "q", "time", "details", "summary",
	)

	// ============================================================
	// 链接安全配置
	// 与 Node.js html-sanitizer.ts 的 afterSanitizeAttributes 钩子保持一致
	// ============================================================

	// 允许链接的基本属性
	policy.AllowAttrs("href", "target", "rel").OnElements("a")

	// 允许相对 URL
	// 注意：图片 URL 已在 processor.ProcessImages 中转换为绝对路径
	// 链接 URL 保留相对路径是安全的（由浏览器解析）
	// 之前设置为 false 会导致某些边缘情况下的 URL 被错误移除
	policy.AllowRelativeURLs(true)

	// 允许的 URL schemes
	// 必须显式指定，否则 bluemonday 可能会移除不认识的 URL
	policy.AllowURLSchemes("http", "https", "mailto", "data")

	// 为所有外部链接（完全限定的 URL）添加 target="_blank"
	// 这样外部链接会在新标签页打开，与 Node.js 端行为一致
	// 安全性：防止 tabnabbing 攻击（需配合 noopener）
	policy.AddTargetBlankToFullyQualifiedLinks(true)

	// 为所有链接添加 rel="nofollow"
	// SEO 考虑：不传递页面权重给外部链接
	policy.RequireNoFollowOnLinks(true)

	// 为外部链接添加 rel="noopener"
	// 安全性：防止新打开的页面通过 window.opener 访问原页面
	// 这是防止 tabnabbing 攻击的关键配置
	policy.RequireNoReferrerOnFullyQualifiedLinks(true)

	// ============================================================
	// 图片属性配置
	// ============================================================

	// 允许图片元素
	policy.AllowElements("img")

	// 允许图片的 URL 属性（src, srcset）
	// 必须使用 AllowURLSchemeWithCustomPolicy 或 AllowAttrs + AllowStandardURLs 配合
	// 单独使用 AllowAttrs("src") 不会保留 URL 值
	policy.AllowAttrs("src").OnElements("img")
	policy.AllowAttrs("srcset").OnElements("img")

	// 允许图片的非 URL 属性
	// - sizes: 响应式配置
	// - alt: 无障碍访问必需
	// - width, height: 防止布局偏移 (CLS)
	// - loading, decoding: 懒加载优化（由 processor/image.go 设置）
	policy.AllowAttrs("sizes", "alt", "width", "height", "loading", "decoding").OnElements("img")

	// 允许标准 URL（确保 src 等 URL 属性不被移除）
	// 这会应用到所有包含 URL 的属性（href, src, srcset 等）
	policy.AllowStandardURLs()

	// ============================================================
	// 表格属性配置
	// ============================================================

	// 允许表格单元格的合并和作用域属性
	policy.AllowAttrs("colspan", "rowspan", "scope").OnElements("th", "td")

	// ============================================================
	// 其他属性配置
	// ============================================================

	// 时间标签的 datetime 属性（机器可读的日期时间）
	policy.AllowAttrs("datetime").OnElements("time")

	return &Sanitizer{policy: policy}
}

// Sanitize 净化 HTML 内容
//
// 对输入的 HTML 字符串进行安全净化处理，移除所有不在白名单中的标签和属性，
// 同时自动为外部链接添加安全属性。
//
// 参数：
//   - html: 待净化的原始 HTML 字符串
//
// 返回：
//   - 净化后的安全 HTML 字符串
//
// 处理规则：
//   - 移除所有脚本标签 (<script>) 和事件处理器 (onclick, onerror 等)
//   - 移除不在白名单中的标签，但保留其文本内容
//   - 移除不在白名单中的属性
//   - 为外部链接自动添加 target="_blank" 和安全的 rel 属性
//
// 示例：
//
//	input := `<p onclick="alert('xss')">Hello <script>evil()</script>World</p>`
//	output := sanitizer.Sanitize(input)
//	// output: "<p>Hello World</p>"
func (s *Sanitizer) Sanitize(html string) string {
	return s.policy.Sanitize(html)
}

// defaultSanitizer 默认净化器单例
//
// 在包初始化时创建，避免每次调用都创建新实例。
// bluemonday.Policy 是线程安全的，可以并发使用。
var defaultSanitizer = NewSanitizer()

// SanitizeHTML 使用默认净化器净化 HTML（便捷函数）
//
// 这是 Sanitize 方法的便捷包装，使用包级别的默认净化器实例。
// 适用于不需要自定义配置的场景。
//
// 参数：
//   - html: 待净化的原始 HTML 字符串
//
// 返回：
//   - 净化后的安全 HTML 字符串
//
// 线程安全：是（底层 bluemonday.Policy 支持并发访问）
//
// 使用示例：
//
//	cleanHTML := SanitizeHTML(rawHTML)
func SanitizeHTML(html string) string {
	return defaultSanitizer.Sanitize(html)
}
