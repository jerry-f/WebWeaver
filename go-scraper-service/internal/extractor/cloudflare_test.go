package extractor

import (
	"testing"
)

func TestDecodeCloudflareEmail(t *testing.T) {
	tests := []struct {
		name     string
		encoded  string
		expected string
	}{
		{
			name:     "编码1 - 来自链接",
			encoded:  "99e0f0fffcf7feb7ebecf8f7d9fef4f8f0f5b7faf6f4",
			expected: "yifeng.ruan@gmail.com",
		},
		{
			name:     "编码2 - 来自 data-cfemail",
			encoded:  "83faeae5e6ede4adf1f6e2edc3e4eee2eaefade0ecee",
			expected: "yifeng.ruan@gmail.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := decodeCloudflareEmail(tt.encoded)
			if result != tt.expected {
				t.Errorf("decodeCloudflareEmail(%s) = %q, want %q", tt.encoded, result, tt.expected)
			}
		})
	}
}

func TestDecodeCloudflareEmails(t *testing.T) {
	input := `<p>本杂志<a href="https://github.com/ruanyf/weekly">开源</a>，欢迎<a href="https://github.com/ruanyf/weekly/issues">投稿</a>。另有<a href="https://github.com/ruanyf/weekly/issues/8591">《谁在招人》</a>服务，发布程序员招聘信息。合作请<a href="/cdn-cgi/l/email-protection#99e0f0fffcf7feb7ebecf8f7d9fef4f8f0f5b7faf6f4">邮件联系</a>（<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="83faeae5e6ede4adf1f6e2edc3e4eee2eaefade0ecee">[email&#160;protected]</a>）。</p>`

	t.Logf("输入 HTML:\n%s\n", input)

	result := DecodeCloudflareEmails(input)

	t.Logf("输出 HTML:\n%s\n", result)

	// 检查是否还包含 Cloudflare 保护标记
	if contains := containsCfEmail(result); contains {
		t.Errorf("结果仍包含 Cloudflare 邮箱保护标记")
	}

	// 检查是否包含解码后的邮箱
	if !containsString(result, "yifeng.ruan@gmail.com") {
		t.Errorf("结果不包含解码后的邮箱 yifeng.ruan@gmail.com")
	}
}

func containsCfEmail(s string) bool {
	return containsString(s, "cdn-cgi/l/email-protection") || containsString(s, "data-cfemail")
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStringHelper(s, substr))
}

func containsStringHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
