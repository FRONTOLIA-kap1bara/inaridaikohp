/// <reference types="astro/client" />
import { getSecret } from "astro:env/server";
import { fetchCmsJson, isCmsId, isRecord, resolveCmsEndpoint } from "./microcms";

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

const isNewsItem = (value: unknown): value is NewsItem => isRecord(value) &&
  isCmsId(value.id) && typeof value.title === "string" &&
  typeof value.content === "string" && typeof value.time === "string";

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
  const url = resolveCmsEndpoint(serviceOrUrl, "news");
  url.search = new URLSearchParams({ limit: String(limit), offset: String(offset), orders: "-time", depth: "1" }).toString();
  return url;
};

const resolveNewsDetailEndpoint = (serviceOrUrl: string, id: string) => {
  const url = resolveCmsEndpoint(serviceOrUrl, "news", id);
  url.search = "depth=1";
  return url;
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
    const signal = AbortSignal.timeout(10_000);
    const budget = { remainingBytes: 4 * 1024 * 1024 };
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
      const json = await fetchCmsJson(endpoint, apiKey, signal, budget);
      if (!isRecord(json) || !Array.isArray(json.contents) || json.contents.length > pageLimit) {
        throw new Error("Invalid CMS news page");
      }
      const pageItems = json.contents.filter(isNewsItem);

      if (typeof json.totalCount === "number" && Number.isSafeInteger(json.totalCount) && json.totalCount >= 0) {
        totalCount = json.totalCount;
      }

      if (json.contents.length === 0) {
        break;
      }

      collected.push(...pageItems);
      const nextOffset = offset + json.contents.length;
      if (nextOffset <= offset) {
        break;
      }
      offset = nextOffset;

      if (json.contents.length < pageLimit) {
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

  if (!isCmsId(id) || !serviceDomain || !apiKey) {
    return null;
  }

  try {
    const endpoint = resolveNewsDetailEndpoint(serviceDomain, id);
    const json = await fetchCmsJson(endpoint, apiKey, AbortSignal.timeout(10_000));
    if (!isNewsItem(json) || json.id !== id) {
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
