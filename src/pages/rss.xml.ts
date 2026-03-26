import type { APIRoute } from "astro";
import { fetchNews, getCategoryLabel, toSummary } from "../lib/news";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const toRfc822Date = (value: string | undefined) => {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
};

export const GET: APIRoute = async ({ url, locals }) => {
  const origin = `${url.protocol}//${url.host}`;
  const runtimeEnv =
    typeof locals === "object" && locals && "runtime" in locals
      ? (locals as { runtime?: { env?: unknown } }).runtime?.env
      : undefined;

  const feedUrl = `${origin}/rss.xml`;
  const siteUrl = `${origin}/`;
  const news = await fetchNews(50, runtimeEnv);
  const latestPubDate = toRfc822Date(news.items[0]?.time);

  const itemsXml = news.items
    .map((item) => {
      const itemUrl = `${origin}/news/${encodeURIComponent(item.id)}`;
      const summary = toSummary(item.content, 220);
      const category = getCategoryLabel(item.category);
      const pubDate = toRfc822Date(item.time);

      return [
        "<item>",
        `<title>${escapeXml(item.title)}</title>`,
        `<link>${escapeXml(itemUrl)}</link>`,
        `<guid isPermaLink="true">${escapeXml(itemUrl)}</guid>`,
        `<category>${escapeXml(category)}</category>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        `<description>${escapeXml(summary)}</description>`,
        "</item>"
      ].join("");
    })
    .join("");

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `<channel>`,
    `<title>${escapeXml("豊川高校和太鼓部公式サイト│「威鳴太鼓」 - ニュース")}</title>`,
    `<link>${escapeXml(siteUrl)}</link>`,
    `<description>${escapeXml("威鳴太鼓（豊川高校和太鼓部）の最新ニュースを配信しています。")}</description>`,
    `<language>ja-JP</language>`,
    `<lastBuildDate>${escapeXml(latestPubDate)}</lastBuildDate>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    `</channel>`,
    `</rss>`
  ].join("");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
};
