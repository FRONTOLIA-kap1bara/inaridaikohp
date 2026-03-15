/// <reference types="astro/client" />

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
};

type NewsDetailResponse = NewsItem & {
  message?: string;
};

export type NewsFetchResult = {
  items: NewsItem[];
  source: "microcms" | "fallback";
  message?: string;
};

const DEFAULT_LIMIT = 100;

const sortByNewest = (items: NewsItem[]) =>
  [...items].sort((a, b) => {
    const aTime = new Date(a.time).getTime();
    const bTime = new Date(b.time).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
    return bTime - aTime;
  });

export const getCategoryLabel = (category: unknown) => {
  if (!category) return "未分類";
  if (typeof category === "string") return category;
  if (typeof category === "object" && "name" in category) {
    const categoryName = category.name;
    return typeof categoryName === "string" && categoryName ? categoryName : "未分類";
  }
  return "未分類";
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

const resolveNewsEndpoint = (serviceOrUrl: string, limit: number) => {
  const trimmed = serviceOrUrl.trim();
  const query = `limit=${limit}&orders=-time&depth=1`;

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

export async function fetchNews(limit = DEFAULT_LIMIT): Promise<NewsFetchResult> {
  const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = import.meta.env.MICROCMS_API_KEY;

  if (!serviceDomain || !apiKey) {
    return {
      items: [],
      source: "fallback",
      message: "microCMSの設定情報が不足しています。"
    };
  }

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  const endpoint = resolveNewsEndpoint(serviceDomain, safeLimit);

  try {
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
        message: "ニュースの取得に失敗しました。"
      };
    }

    const json = (await response.json()) as NewsResponse;
    const items = Array.isArray(json.contents) ? json.contents : [];

    return {
      items: sortByNewest(items),
      source: "microcms"
    };
  } catch {
    return {
      items: [],
      source: "fallback",
      message: "ニュース取得中にエラーが発生しました。"
    };
  }
}

export async function fetchNewsById(id: string): Promise<NewsItem | null> {
  const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = import.meta.env.MICROCMS_API_KEY;

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
