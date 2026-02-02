// Package extractor 提供 HTML 内容提取和净化功能
//
// 本文件实现 Cloudflare Email Protection 解码功能

package extractor

import (
	"log"
	"regexp"
	"strconv"
	"strings"
)

// CloudflareEmailDecoder Cloudflare 邮箱保护解码器
//
// Cloudflare 的 Email Protection 功能会对网页中的邮箱地址进行混淆处理，
// 将 mailto: 链接和明文邮箱替换为编码后的格式，防止爬虫收集邮箱。
//
// 混淆格式示例：
//   - 链接: href="/cdn-cgi/l/email-protection#..."
//   - 文本: <span class="__cf_email__" data-cfemail="...">
//   - 脚本: <script data-cfasync="false" data-cfemail="...">
//
// 解码算法：
//   1. 编码字符串是十六进制格式
//   2. 第一个字节是 XOR 密钥
//   3. 后续每两个字符一组，与密钥进行 XOR 运算得到原始字符
//
// 与 Node.js 端的对应：
//   - 此功能在 Node.js 端通过浏览器 JS 执行自动解码
//   - Go 静态抓取需要手动实现解码逻辑
type CloudflareEmailDecoder struct {
	// 匹配 data-cfemail 属性的正则
	cfEmailAttrRegex *regexp.Regexp
	// 匹配 /cdn-cgi/l/email-protection# 链接的正则
	cfEmailLinkRegex *regexp.Regexp
	// 匹配完整的 __cf_email__ span 标签
	cfEmailSpanRegex *regexp.Regexp
}

// NewCloudflareEmailDecoder 创建 Cloudflare 邮箱解码器
func NewCloudflareEmailDecoder() *CloudflareEmailDecoder {
	return &CloudflareEmailDecoder{
		// 匹配 data-cfemail="xxxx" 属性
		cfEmailAttrRegex: regexp.MustCompile(`data-cfemail="([a-fA-F0-9]+)"`),
		// 匹配 /cdn-cgi/l/email-protection#xxxx 链接（带编码）
		cfEmailLinkRegex: regexp.MustCompile(`(href|src)="[^"]*?/cdn-cgi/l/email-protection#([a-fA-F0-9]+)"`),
		// 匹配完整的 <a href="...email-protection..."><span class="__cf_email__"...>[email&#160;protected]</span></a>
		cfEmailSpanRegex: regexp.MustCompile(`<a[^>]*href="[^"]*?/cdn-cgi/l/email-protection[^"]*"[^>]*>(?:<span[^>]*class="__cf_email__"[^>]*>)?\[email[^<]*\](?:</span>)?</a>`),
	}
}

// Decode 解码 Cloudflare 混淆的邮箱
//
// 对 HTML 中被 Cloudflare Email Protection 混淆的邮箱进行解码还原。
//
// 参数：
//   - html: 可能包含混淆邮箱的 HTML 字符串
//
// 返回：
//   - 解码后的 HTML 字符串
//
// 处理的混淆格式：
//  1. href="/cdn-cgi/l/email-protection#xxxx" → href="mailto:email@example.com"
//  2. <span class="__cf_email__" data-cfemail="xxxx">[email protected]</span> → email@example.com
//  3. <a href="...email-protection#xxx">[email protected]</a> → email@example.com（带链接）
//  4. <a href="/cdn-cgi/l/email-protection" data-cfemail="xxx">...</a> → 链接中无编码，编码在属性中
//
// 示例：
//
//	decoder := NewCloudflareEmailDecoder()
//	// 输入: <a href="/cdn-cgi/l/email-protection#0b6665...">联系我们</a>
//	// 输出: <a href="mailto:test@example.com">联系我们</a>
//	decoded := decoder.Decode(html)
func (d *CloudflareEmailDecoder) Decode(html string) string {
	// 调试：检查是否包含 Cloudflare 邮箱保护
	// if strings.Contains(html, "cdn-cgi/l/email-protection") || strings.Contains(html, "data-cfemail") {
	// 	log.Printf("[CloudflareDecoder] 检测到 Cloudflare Email Protection")
	// }

	// 1. 处理完整的 <a> 标签：href="/cdn-cgi/l/email-protection" + data-cfemail="xxx"
	// 这种格式链接中没有编码，编码在 data-cfemail 属性中
	html = d.replaceFullEmailLinks(html)

	// 2. 替换 /cdn-cgi/l/email-protection#xxxx 链接为 mailto:（链接中带编码）
	html = d.cfEmailLinkRegex.ReplaceAllStringFunc(html, func(match string) string {
		// log.Printf("[CloudflareDecoder] 匹配到链接: %s", match)
		submatches := d.cfEmailLinkRegex.FindStringSubmatch(match)
		if len(submatches) < 3 {
			log.Printf("[CloudflareDecoder] 子匹配不足: %v", submatches)
			return match
		}
		attrName := submatches[1] // href 或 src
		encoded := submatches[2]
		// log.Printf("[CloudflareDecoder] 编码: %s", encoded)
		email := decodeCloudflareEmail(encoded)
		// log.Printf("[CloudflareDecoder] 解码结果: %s", email)
		if email == "" {
			return match
		}
		return attrName + `="mailto:` + email + `"`
	})

	// 3. 替换独立的 data-cfemail span 标签
	html = d.replaceDataCfemailSpans(html)

	return html
}

// replaceFullEmailLinks 处理完整的邮箱链接标签
// 格式: <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="xxx">[email&#160;protected]</a>
func (d *CloudflareEmailDecoder) replaceFullEmailLinks(html string) string {
	// 匹配包含 data-cfemail 的完整 <a> 标签
	// 这种情况下链接中可能没有 #xxx 编码，编码在 data-cfemail 属性中
	fullLinkRegex := regexp.MustCompile(`<a[^>]*href="[^"]*?/cdn-cgi/l/email-protection[^"]*"[^>]*data-cfemail="([a-fA-F0-9]+)"[^>]*>[^<]*</a>`)

	html = fullLinkRegex.ReplaceAllStringFunc(html, func(match string) string {
		submatches := fullLinkRegex.FindStringSubmatch(match)
		if len(submatches) < 2 {
			return match
		}
		email := decodeCloudflareEmail(submatches[1])
		if email == "" {
			return match
		}
		return email
	})

	// 也处理 data-cfemail 在 href 之前的情况
	fullLinkRegex2 := regexp.MustCompile(`<a[^>]*data-cfemail="([a-fA-F0-9]+)"[^>]*href="[^"]*?/cdn-cgi/l/email-protection[^"]*"[^>]*>[^<]*</a>`)

	html = fullLinkRegex2.ReplaceAllStringFunc(html, func(match string) string {
		submatches := fullLinkRegex2.FindStringSubmatch(match)
		if len(submatches) < 2 {
			return match
		}
		email := decodeCloudflareEmail(submatches[1])
		if email == "" {
			return match
		}
		return email
	})

	return html
}

// replaceDataCfemailSpans 替换包含 data-cfemail 的 span 标签
func (d *CloudflareEmailDecoder) replaceDataCfemailSpans(html string) string {
	// 匹配 <span...data-cfemail="xxx"...>[email&#160;protected]</span> 或类似格式
	spanRegex := regexp.MustCompile(`<span[^>]*data-cfemail="([a-fA-F0-9]+)"[^>]*>[^<]*</span>`)

	return spanRegex.ReplaceAllStringFunc(html, func(match string) string {
		submatches := spanRegex.FindStringSubmatch(match)
		if len(submatches) < 2 {
			return match
		}
		email := decodeCloudflareEmail(submatches[1])
		if email == "" {
			return match
		}
		return email
	})
}

// decodeCloudflareEmail 解码单个 Cloudflare 邮箱编码
//
// Cloudflare Email Protection 编码算法：
//  1. 编码字符串是十六进制格式
//  2. 前两个字符（第一个字节）是 XOR 密钥
//  3. 后续每两个字符一组，转换为字节后与密钥 XOR 得到原始字符
//
// 示例：
//
//	编码: "0b6665646261676f2e656d61696c40676d61696c2e636f6d"
//	密钥: 0x0b
//	解码过程:
//	  0x66 ^ 0x0b = 'm' (0x6d)
//	  0x65 ^ 0x0b = 'n' (0x6e)
//	  ...
//	结果: "test@example.com"
func decodeCloudflareEmail(encoded string) string {
	if len(encoded) < 2 {
		return ""
	}

	// 第一个字节是 XOR 密钥
	key, err := strconv.ParseInt(encoded[:2], 16, 64)
	if err != nil {
		return ""
	}

	var result strings.Builder
	for i := 2; i < len(encoded); i += 2 {
		if i+2 > len(encoded) {
			break
		}
		charCode, err := strconv.ParseInt(encoded[i:i+2], 16, 64)
		if err != nil {
			return ""
		}
		result.WriteByte(byte(charCode ^ key))
	}

	return result.String()
}

// defaultCfDecoder 默认解码器实例
var defaultCfDecoder = NewCloudflareEmailDecoder()

// DecodeCloudflareEmails 使用默认解码器解码 Cloudflare 邮箱（便捷函数）
//
// 参数：
//   - html: 可能包含混淆邮箱的 HTML 字符串
//
// 返回：
//   - 解码后的 HTML 字符串
//
// 线程安全：是（只读操作，正则是预编译的）
func DecodeCloudflareEmails(html string) string {
	return defaultCfDecoder.Decode(html)
}
