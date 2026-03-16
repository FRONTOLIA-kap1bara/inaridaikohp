import type { APIRoute } from "astro";
import { fetchNews } from "../lib/news";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
};

const buildUrlNode = (entry: SitemapEntry) => {
  const lines = [`<url>`, `<loc>${escapeXml(entry.loc)}</loc>`];
  if (entry.lastmod) lines.push(`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  if (entry.changefreq) lines.push(`<changefreq>${entry.changefreq}</changefreq>`);
  if (typeof entry.priority === "number") lines.push(`<priority>${entry.priority.toFixed(1)}</priority>`);
  lines.push(`</url>`);
  return lines.join("");
};

export const GET: APIRoute = async ({ url, locals }) => {
  const origin = `${url.protocol}//${url.host}`;
  const runtimeEnv =
    typeof locals === "object" && locals && "runtime" in locals
      ? (locals as { runtime?: { env?: unknown } }).runtime?.env
      : undefined;

  const nowIso = new Date().toISOString();
  const entries: SitemapEntry[] = [
    {
      loc: `${origin}/`,
      lastmod: nowIso,
      changefreq: "weekly",
      priority: 1.0
    },
    {
      loc: `${origin}/news`,
      lastmod: nowIso,
      changefreq: "daily",
      priority: 0.9
    }
  ];

  const news = await fetchNews(undefined, runtimeEnv);
  for (const item of news.items) {
    entries.push({
      loc: `${origin}/news/${encodeURIComponent(item.id)}`,
      lastmod: item.time || nowIso,
      changefreq: "monthly",
      priority: 0.7
    });
  }

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map(buildUrlNode),
    `</urlset>`
  ].join("");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
};
