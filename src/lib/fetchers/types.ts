export interface FetchedArticle {
  externalId: string
  title: string
  content?: string
  summary?: string
  url: string
  imageUrl?: string
  author?: string
  publishedAt?: Date
}

export interface FetchResult {
  articles: FetchedArticle[]
  errors: string[]
}

export interface ScrapeConfig {
  listSelector: string
  titleSelector: string
  linkSelector: string
  contentSelector?: string
  imageSelector?: string
  authorSelector?: string
  dateSelector?: string
}

export interface SourceConfig {
  scrape?: ScrapeConfig
  [key: string]: unknown
}
