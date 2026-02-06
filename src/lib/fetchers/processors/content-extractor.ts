import { JSDOM } from 'jsdom'

/**
 * 获取元素的有效 class 列表
 */
function getValidClasses(el: Element): string[] {
  const classList = el.getAttribute('class')
  if (!classList) return []
  return classList
    .split(/\s+/)
    .filter((c) => c.length > 0 && !c.includes('[') && !c.includes(']') && !c.includes(':') && !c.includes('/'))
}

/**
 * 获取元素的 data-* 属性
 */
function getDataAttrs(el: Element): Attr[] {
  return Array.from(el.attributes).filter(
    (attr) => attr.name.startsWith('data-') && attr.value && !attr.value.includes('"') && !attr.value.includes("'"),
  )
}

/**
 * 获取元素的普通属性（非 id、class、data-* 的有效属性）
 */
function getOtherAttrs(el: Element): Attr[] {
  const skipAttrs = new Set(['id', 'class', 'style'])
  return Array.from(el.attributes).filter(
    (attr) =>
      !skipAttrs.has(attr.name) &&
      !attr.name.startsWith('data-') &&
      attr.value &&
      !attr.value.includes('"') &&
      !attr.value.includes("'"),
  )
}

/**
 * 构建选择器：不使用 tagName，只用 id + class + data-* + 其他属性
 */
function buildSelector(el: Element): string {
  const parts: string[] = []

  // 1. id（最可靠）
  const id = el.getAttribute('id')
  if (id && id !== 'readability-page-1') {
    parts.push(`#${id}`)
  }

  // 2. 所有有效 class
  const validClasses = getValidClasses(el)
  if (validClasses.length > 0) {
    parts.push(validClasses.map((c) => `.${c}`).join(''))
  }

  // 3. data-* 属性
  const dataAttrs = getDataAttrs(el)
  for (const attr of dataAttrs) {
    parts.push(`[${attr.name}="${attr.value}"]`)
  }

  // 4. 如果以上都没有，尝试使用其他属性（如 width, name 等）
  if (parts.length === 0) {
    const otherAttrs = getOtherAttrs(el)
    for (const attr of otherAttrs.slice(0, 2)) {
      parts.push(`[${attr.name}="${attr.value}"]`)
    }
  }

  return parts.join('')
}

/**
 * 从源 DOM 中查找与 Readability 根元素匹配的原始元素
 *
 * 策略：
 * 1. 用 Readability 根元素的 id/class/data-* 构建选择器
 * 2. 在源 DOM 中查找匹配的元素列表
 * 3. 如果只有一个匹配，直接返回
 * 4. 如果有多个匹配，用子元素特征进行过滤
 * 5. 通过采样子元素的特征（id、class、文本内容）来筛选正确的元素
 */
export function findOriginalRoot(contentHtml: string, sourceDoc: Document): { element: Element | null; selector: string | null } {
  const dom = new JSDOM(contentHtml)
  const doc = dom.window.document

  // Readability 会包装一个 div#readability-page-1
  const wrapper = doc.querySelector('#readability-page-1')
  const rootElement = wrapper?.firstElementChild || doc.body.firstElementChild

  if (!rootElement) {
    return { element: null, selector: null }
  }

  /**
   * 安全地在源 DOM 中查询选择器
   */
  function queryAll(selector: string): Element[] {
    if (!selector) return []
    try {
      return [...sourceDoc.querySelectorAll(selector)]
    } catch {
      return []
    }
  }

  /**
   * 获取元素的采样特征（用于过滤匹配）
   * 优先选择有明确标识的子元素
   */
  function getSampleFeatures(el: Element): Array<{ type: 'selector' | 'text'; value: string }> {
    const features: Array<{ type: 'selector' | 'text'; value: string }> = []
    const allChildren = el.querySelectorAll('*')

    // 收集有明确特征的子元素
    const candidates: Array<{ el: Element; score: number }> = []

    allChildren.forEach((child) => {
      let score = 0
      const id = child.getAttribute('id')
      const classes = getValidClasses(child)
      const dataAttrs = getDataAttrs(child)

      // 有 id 得分最高
      if (id) score += 10
      // 有多个 class 得分较高
      score += Math.min(classes.length, 3) * 2
      // 有 data 属性也加分
      score += Math.min(dataAttrs.length, 2)

      if (score > 0) {
        candidates.push({ el: child, score })
      }
    })

    // 按得分排序，取前 5 个
    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, 5)

    for (const { el: child } of topCandidates) {
      const selector = buildSelector(child)
      if (selector) {
        features.push({ type: 'selector', value: selector })
      }
    }

    // 如果选择器特征不足，补充文本特征
    if (features.length < 3) {
      // 获取有意义的文本节点（长度适中的）
      const textNodes: string[] = []
      const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || ''
        // 选择 10-100 字符的文本，避免太短或太长
        if (text.length >= 10 && text.length <= 100) {
          textNodes.push(text)
        }
      }

      // 取前 3 个文本特征
      for (const text of textNodes.slice(0, 3)) {
        features.push({ type: 'text', value: text })
      }
    }

    return features
  }

  /**
   * 检查候选元素是否包含指定特征
   */
  function hasFeature(candidate: Element, feature: { type: 'selector' | 'text'; value: string }): boolean {
    if (feature.type === 'selector') {
      try {
        return candidate.querySelector(feature.value) !== null
      } catch {
        return false
      }
    } else {
      // 文本匹配
      return candidate.textContent?.includes(feature.value) || false
    }
  }

  /**
   * 用特征过滤候选元素列表
   */
  function filterByFeatures(candidates: Element[], features: Array<{ type: 'selector' | 'text'; value: string }>): Element[] {
    if (candidates.length <= 1 || features.length === 0) {
      return candidates
    }

    let filtered = [...candidates]

    for (const feature of features) {
      const matched = filtered.filter((c) => hasFeature(c, feature))
      // 如果这个特征能进一步过滤，就使用过滤结果
      if (matched.length > 0 && matched.length < filtered.length) {
        filtered = matched
      }
      // 如果已经只剩一个，提前返回
      if (filtered.length === 1) {
        break
      }
    }

    return filtered
  }

  // ========================================
  // 步骤 1: 构建选择器并查找匹配
  // ========================================
  const fullSelector = buildSelector(rootElement)
  let matchList = queryAll(fullSelector)

  // 如果完整选择器没有匹配，尝试更宽松的选择器
  if (matchList.length === 0) {
    // 尝试只用 id
    const id = rootElement.getAttribute('id')
    if (id && id !== 'readability-page-1') {
      matchList = queryAll(`#${id}`)
    }

    // 尝试只用 class
    if (matchList.length === 0) {
      const classes = getValidClasses(rootElement)
      if (classes.length > 0) {
        // 尝试所有 class
        matchList = queryAll(classes.map((c) => `.${c}`).join(''))

        // 如果还是没有，尝试单个 class
        if (matchList.length === 0) {
          for (const cls of classes) {
            matchList = queryAll(`.${cls}`)
            if (matchList.length > 0) break
          }
        }
      }
    }

    // 尝试 data 属性
    if (matchList.length === 0) {
      const dataAttrs = getDataAttrs(rootElement)
      if (dataAttrs.length > 0) {
        const attr = dataAttrs[0]
        matchList = queryAll(`[${attr.name}="${attr.value}"]`)
      }
    }
  }

  // 没有找到任何匹配
  if (matchList.length === 0) {
    return { element: null, selector: null }
  }

  // ========================================
  // 步骤 2: 如果只有一个匹配，直接返回
  // ========================================
  if (matchList.length === 1) {
    return { element: matchList[0], selector: fullSelector }
  }

  // ========================================
  // 步骤 3: 多个匹配，用子元素特征过滤
  // ========================================
  const features = getSampleFeatures(rootElement)
  const filtered = filterByFeatures(matchList, features)

  if (filtered.length === 1) {
    return { element: filtered[0], selector: fullSelector }
  }

  // ========================================
  // 步骤 4: 仍有多个，返回第一个（通常是正确的）
  // ========================================
  // 在 DOM 中越靠前的元素通常是主要内容区域
  return { element: filtered[0] || matchList[0], selector: fullSelector }
}