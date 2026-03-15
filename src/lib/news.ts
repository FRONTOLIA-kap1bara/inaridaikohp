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

export type NewsFetchResult = {
  items: NewsItem[];
  source: "microcms" | "fallback";
  message?: string;
};

export async function fetchNews(): Promise<NewsFetchResult> {
  const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = import.meta.env.MICROCMS_API_KEY;

  if (!serviceDomain || !apiKey) {
    return {
      items: [],
      source: "fallback",
      message: "microCMSの接続情報が未設定のため、ニュースは現在準備中です。"
    };
  }

  const endpoint = `https://${serviceDomain}.microcms.io/api/v1/news?limit=6&orders=-time&depth=1`;

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
        message: "ニュース取得に失敗しました。時間をおいて再度ご確認ください。"
      };
    }

    const json = (await response.json()) as NewsResponse;
    const items = Array.isArray(json.contents) ? json.contents : [];

    return {
      items,
      source: "microcms"
    };
  } catch {
    return {
      items: [],
      source: "fallback",
      message: "ニュース取得中に接続エラーが発生しました。"
    };
  }
}
