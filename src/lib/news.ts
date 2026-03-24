/// <reference types="astro/client" />
import { getSecret } from "astro:env/server";

type NewsCategory = {
  id?: string;
  name?: string;
};

export type NewsItem = {
  id: string;
  title: string;
  content: string;
  time: string;
  category?: NewsCategory | string | null;
};

type NewsResponse = {
  contents?: NewsItem[];
  totalCount?: number;
  limit?: number;
  offset?: number;
};

type NewsDetailResponse = NewsItem & {
  message?: string;
};

export type NewsFetchResult = {
  items: NewsItem[];
  source: "microcms" | "fallback";
  message?: string;
};

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_FETCHES = 200;
const UNCLASSIFIED_LABEL = "未分類";
const FALLBACK_MESSAGES = {
  missingConfig: "microCMSの設定情報が不足しています。",
  fetchFailed: "ニュースの取得に失敗しました。",
  fetchError: "ニュース取得中にエラーが発生しました。"
} as const;

type MicroCMSEnvKey = "MICROCMS_SERVICE_DOMAIN" | "MICROCMS_API_KEY";

const readEnvString = (env: unknown, key: MicroCMSEnvKey) => {
  if (!env || typeof env !== "object") return undefined;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const normalizeLimit = (limit?: number) => {
  const numericLimit = typeof limit === "number" ? limit : Number.NaN;
  return Number.isFinite(numericLimit) && numericLimit > 0
    ? Math.floor(numericLimit)
    : Number.POSITIVE_INFINITY;
};

const toTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const resolveMicroCMSEnv = (runtimeEnv?: unknown) => {
  const secretServiceDomain = getSecret("MICROCMS_SERVICE_DOMAIN");
  const secretApiKey = getSecret("MICROCMS_API_KEY");

  return {
    serviceDomain:
      readEnvString(runtimeEnv, "MICROCMS_SERVICE_DOMAIN") ??
      secretServiceDomain,
    apiKey:
      readEnvString(runtimeEnv, "MICROCMS_API_KEY") ??
      secretApiKey
  };
};

const sortByNewest = (items: NewsItem[]) =>
  [...items].sort((a, b) => {
    const aTime = toTimestamp(a.time);
    const bTime = toTimestamp(b.time);
    return bTime - aTime;
  });

export const getCategoryLabel = (category: unknown) => {
  if (!category) return UNCLASSIFIED_LABEL;
  if (typeof category === "string") return category;
  if (typeof category === "object" && "name" in category) {
    const categoryName = category.name;
    return typeof categoryName === "string" && categoryName ? categoryName : UNCLASSIFIED_LABEL;
  }
  return UNCLASSIFIED_LABEL;
};

export const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const toSummary = (text: string, maxLength = 140) => {
  const stripped = stripHtml(text);
  return stripped.length > maxLength ? `${stripped.slice(0, maxLength)}...` : stripped;
};

export const formatDate = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

const resolveNewsEndpoint = (serviceOrUrl: string, limit: number, offset = 0) => {
  const trimmed = serviceOrUrl.trim();
  const query = `limit=${limit}&offset=${offset}&orders=-time&depth=1`;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    const isNewsEndpoint = normalizedPath.endsWith("/api/v1/news");
    if (isNewsEndpoint) {
      url.search = query;
      return url.toString();
    }

    return `${url.origin}/api/v1/news?${query}`;
  }

  const domain = trimmed.replace(/\.microcms\.io$/i, "");
  return `https://${domain}.microcms.io/api/v1/news?${query}`;
};

const resolveNewsDetailEndpoint = (serviceOrUrl: string, id: string) => {
  const trimmed = serviceOrUrl.trim();
  const encodedId = encodeURIComponent(id);
  const query = "depth=1";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    const isNewsEndpoint = normalizedPath.endsWith("/api/v1/news");
    if (isNewsEndpoint) {
      url.pathname = `${normalizedPath}/${encodedId}`;
      url.search = query;
      return url.toString();
    }

    return `${url.origin}/api/v1/news/${encodedId}?${query}`;
  }

  const domain = trimmed.replace(/\.microcms\.io$/i, "");
  return `https://${domain}.microcms.io/api/v1/news/${encodedId}?${query}`;
};

export async function fetchNews(limit?: number, runtimeEnv?: unknown): Promise<NewsFetchResult> {
  const { serviceDomain, apiKey } = resolveMicroCMSEnv(runtimeEnv);

  if (!serviceDomain || !apiKey) {
    return {
      items: [],
      source: "fallback",
      message: FALLBACK_MESSAGES.missingConfig
    };
  }

  const targetCount = normalizeLimit(limit);

  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;
  let pageFetchCount = 0;
  const collected: NewsItem[] = [];

  try {
    while (offset < totalCount && collected.length < targetCount) {
      if (pageFetchCount >= MAX_PAGE_FETCHES) {
        break;
      }
      pageFetchCount += 1;

      const remaining = targetCount - collected.length;
      const pageLimit = Number.isFinite(remaining)
        ? Math.max(1, Math.min(DEFAULT_PAGE_LIMIT, remaining))
        : DEFAULT_PAGE_LIMIT;
      const endpoint = resolveNewsEndpoint(serviceDomain, pageLimit, offset);
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "X-MICROCMS-API-KEY": apiKey
        }
      });

      if (!response.ok) {
        return {
          items: [],
          source: "fallback",
          message: FALLBACK_MESSAGES.fetchFailed
        };
      }

      const json = (await response.json()) as NewsResponse;
      const pageItems = Array.isArray(json.contents) ? json.contents : [];

      if (typeof json.totalCount === "number") {
        totalCount = json.totalCount;
      }

      if (pageItems.length === 0) {
        break;
      }

      collected.push(...pageItems);
      const nextOffset = offset + pageItems.length;
      if (nextOffset <= offset) {
        break;
      }
      offset = nextOffset;

      if (pageItems.length < pageLimit) {
        break;
      }
    }

    return {
      items: sortByNewest(collected),
      source: "microcms"
    };
  } catch {
    return {
      items: [],
      source: "fallback",
      message: FALLBACK_MESSAGES.fetchError
    };
  }
}

export async function fetchNewsById(id: string, runtimeEnv?: unknown): Promise<NewsItem | null> {
  const { serviceDomain, apiKey } = resolveMicroCMSEnv(runtimeEnv);

  if (!id || !serviceDomain || !apiKey) {
    return null;
  }

  const endpoint = resolveNewsDetailEndpoint(serviceDomain, id);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-MICROCMS-API-KEY": apiKey
      }
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as NewsDetailResponse;
    if (!json?.id || !json?.title || !json?.content || !json?.time) {
      return null;
    }

    return {
      id: json.id,
      title: json.title,
      content: json.content,
      time: json.time,
      category: json.category
    };
  } catch {
    return null;
  }
}
