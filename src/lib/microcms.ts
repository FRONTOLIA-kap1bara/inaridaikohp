/** Only this service may receive the CMS API key. Config is never a general proxy URL. */
export const resolveCmsEndpoint = (service: string, resource: "news" | "gallery", id?: string) => {
  const value = service.trim();
  const url = new URL(value.includes("://") ? value : `https://${value.replace(/\.microcms\.io$/i, "")}.microcms.io`);
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.microcms\.io$/i.test(url.hostname) ||
    url.hash || url.search || !["/", "/api/v1", "/api/v1/", "/api/v1/news", "/api/v1/news/", "/api/v1/gallery", "/api/v1/gallery/"].includes(url.pathname)
  ) throw new Error("Invalid CMS endpoint");
  if (id !== undefined && !isCmsId(id)) throw new Error("Invalid CMS content ID");
  url.pathname = `/api/v1/${resource}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
  return url;
};

export const isCmsId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isImageUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch { return false; }
};

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** The shared deadline covers headers, streaming bodies and all pagination requests. */
export async function fetchCmsJson(
  url: URL, apiKey: string, signal: AbortSignal,
  budget = { remainingBytes: MAX_RESPONSE_BYTES }
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "X-MICROCMS-API-KEY": apiKey },
    redirect: "manual",
    signal
  });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("CMS request failed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      budget.remainingBytes -= chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES || budget.remainingBytes < 0) throw new Error("CMS response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
