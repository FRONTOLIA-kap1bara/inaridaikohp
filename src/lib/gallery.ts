/// <reference types="astro/client" />
import { getSecret } from "astro:env/server";

type MicroCMSEnvKey =
  | "MICROCMS_SERVICE_DOMAIN_GALLERY"
  | "MICROCMS_SERVICE_DOMAIN"
  | "MICROCMS_API_KEY";

type GalleryImage = {
  url?: string;
};

export type GalleryItem = {
  id: string;
  title: string;
  imageUrl: string;
  imageAlt: string;
  time: string;
};

type GalleryResponseItem = {
  id?: string;
  title?: string;
  gallery?: GalleryImage[] | null;
  image?: GalleryImage | null;
  photo?: GalleryImage | null;
  alt?: string;
  imageAlt?: string;
  time?: string;
  publishedAt?: string;
  createdAt?: string;
};

type GalleryResponse = {
  contents?: GalleryResponseItem[];
};

export type GalleryFetchResult = {
  items: GalleryItem[];
  source: "microcms" | "fallback";
  message?: string;
};

const FALLBACK_MESSAGES = {
  missingConfig: "microCMSの設定情報が未設定です。",
  fetchFailed: "ギャラリーの取得に失敗しました。",
  fetchError: "ギャラリー取得中にエラーが発生しました。"
} as const;

const readEnvString = (env: unknown, key: MicroCMSEnvKey) => {
  if (!env || typeof env !== "object") return undefined;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const resolveMicroCMSEnv = (runtimeEnv?: unknown) => {
  const secretGalleryServiceDomain = getSecret("MICROCMS_SERVICE_DOMAIN_GALLERY");
  const secretServiceDomain = getSecret("MICROCMS_SERVICE_DOMAIN");
  const secretApiKey = getSecret("MICROCMS_API_KEY");

  return {
    serviceDomain:
      readEnvString(runtimeEnv, "MICROCMS_SERVICE_DOMAIN_GALLERY") ??
      secretGalleryServiceDomain ??
      readEnvString(runtimeEnv, "MICROCMS_SERVICE_DOMAIN") ??
      secretServiceDomain,
    apiKey:
      readEnvString(runtimeEnv, "MICROCMS_API_KEY") ??
      secretApiKey
  };
};

const toTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const sortByNewest = (items: GalleryItem[]) =>
  [...items].sort((a, b) => toTimestamp(b.time) - toTimestamp(a.time));

const resolveGalleryEndpoint = (serviceOrUrl: string, limit: number) => {
  const trimmed = serviceOrUrl.replace(/\s+/g, "").trim();
  const query = `limit=${limit}&orders=-time&depth=1`;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    const isGalleryEndpoint = normalizedPath.endsWith("/api/v1/gallery");
    if (isGalleryEndpoint) {
      url.search = query;
      return url.toString();
    }

    const maybeEndpoint = `${url.origin}${normalizedPath}`;
    if (maybeEndpoint.endsWith("/api/v1")) {
      return `${maybeEndpoint}/gallery?${query}`;
    }

    return `${url.origin}/api/v1/gallery?${query}`;
  }

  const domain = trimmed.replace(/\.microcms\.io$/i, "");
  return `https://${domain}.microcms.io/api/v1/gallery?${query}`;
};

const toGalleryItems = (item: GalleryResponseItem): GalleryItem[] => {
  const id = typeof item.id === "string" ? item.id : "";
  const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : "ギャラリー写真";
  const imageAlt =
    typeof item.imageAlt === "string" && item.imageAlt.trim()
      ? item.imageAlt.trim()
      : typeof item.alt === "string" && item.alt.trim()
        ? item.alt.trim()
        : `${title}の写真`;
  const time =
    typeof item.time === "string" && item.time
      ? item.time
      : typeof item.publishedAt === "string" && item.publishedAt
        ? item.publishedAt
        : typeof item.createdAt === "string" && item.createdAt
          ? item.createdAt
          : "";

  if (!id) return [];

  const list = Array.isArray(item.gallery)
    ? item.gallery
    : [item.image, item.photo].filter((image): image is GalleryImage => Boolean(image));

  return list
    .map((asset, index) => {
      const imageUrl = typeof asset?.url === "string" ? asset.url : "";
      if (!imageUrl) return null;
      return {
        id: `${id}-${index + 1}`,
        title: list.length > 1 ? `${title} ${index + 1}` : title,
        imageUrl,
        imageAlt,
        time
      } satisfies GalleryItem;
    })
    .filter((galleryItem): galleryItem is GalleryItem => Boolean(galleryItem));
};

export async function fetchGallery(limit = 8, runtimeEnv?: unknown): Promise<GalleryFetchResult> {
  const { serviceDomain, apiKey } = resolveMicroCMSEnv(runtimeEnv);

  if (!serviceDomain || !apiKey) {
    return {
      items: [],
      source: "fallback",
      message: FALLBACK_MESSAGES.missingConfig
    };
  }

  try {
    const endpoint = resolveGalleryEndpoint(serviceDomain, Math.max(1, limit));
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

    const json = (await response.json()) as GalleryResponse;
    const items = (Array.isArray(json.contents) ? json.contents : [])
      .flatMap((item) => toGalleryItems(item))
      .filter((item): item is GalleryItem => Boolean(item));

    return {
      items: sortByNewest(items),
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
