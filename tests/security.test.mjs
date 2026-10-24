import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { sanitizeNewsHtml } from "../src/lib/sanitize-news.ts";
import { fetchCmsJson, isCmsId, resolveCmsEndpoint } from "../src/lib/microcms.ts";

// Unit tests supply runtime secrets explicitly; Astro's virtual module exists only in Vite.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "astro:env/server") return { url: "data:text/javascript,export const getSecret=()=>undefined", shortCircuit: true };
    if (specifier === "./microcms") return nextResolve("./microcms.ts", context);
    return nextResolve(specifier, context);
  }
});
const { fetchNews, fetchNewsById } = await import("../src/lib/news.ts");
const { fetchGallery } = await import("../src/lib/gallery.ts");
const cmsEnv = { MICROCMS_SERVICE_DOMAIN: "demo", MICROCMS_API_KEY: "test-only-key" };
const news = { id: "news-1", title: "活動報告", content: "<p>演奏しました。</p>", time: "2026-10-24" };

test("rich text removes executable HTML, encoded URLs, DOM clobbering and CSS injection", () => {
  const result = sanitizeNewsHtml('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="jav&#x61;script:alert(1)">悪意</a><svg><a onload="alert(1)"></a></svg><form id="site-root"></form><p style="background-image:url(https://evil.test);position:fixed;color:red" onclick="alert(1)">本文</p><iframe src="https://evil.test/embed/1"></iframe>');
  assert.doesNotMatch(result, /<script|onerror|onclick|onload|javascript:|<svg|<form|background-image|position:fixed|evil\.test/i);
  assert.match(result, /color:red/);
  assert.match(result, /本文/);
});

test("legitimate CMS headings, links, lists, tables, images, typography and YouTube embeds survive", () => {
  const result = sanitizeNewsHtml('<h2>報告</h2><p><strong>太鼓</strong><span style="color:#ff0000;font-size:24px">演奏</span><a href="https://example.com" target="_blank">詳細</a></p><ul><li>公演</li></ul><table><tbody><tr><td>日時</td></tr></tbody></table><figure><img src="https://images.microcms-assets.io/image.jpg" width="800" alt="舞台"><figcaption>写真</figcaption></figure><iframe src="https://www.youtube.com/embed/abc_123" allowfullscreen></iframe>');
  for (const tag of ["h2", "strong", "span", "a", "ul", "li", "table", "td", "figure", "img", "figcaption", "iframe"]) assert.match(result, new RegExp(`<${tag}[ >]`));
  assert.match(result, /font-size:24px/);
  assert.match(result, /rel="noopener noreferrer"/);
});

test("only canonical HTTPS microCMS destinations can receive credentials", () => {
  for (const service of ["demo", "demo.microcms.io", "https://demo.microcms.io/api/v1/news"]) {
    assert.equal(resolveCmsEndpoint(service, "news", "news-1").href, "https://demo.microcms.io/api/v1/news/news-1");
    assert.equal(resolveCmsEndpoint(service, "gallery").hostname, "demo.microcms.io");
  }
  for (const service of ["http://demo.microcms.io", "https://evil.test", "demo@evil.test/path", "https://demo.microcms.io.evil.test", "https://user:pass@demo.microcms.io", "https://demo.microcms.io:8443", "https://127.0.0.1", "https://demo.microcms.io/?url=evil"]) assert.throws(() => resolveCmsEndpoint(service, "news"));
  for (const id of [".", "..", "%2e%2e", "../gallery", "a?draftKey=secret", "a/b"]) {
    assert.equal(isCmsId(id), false);
    assert.throws(() => resolveCmsEndpoint("demo", "news", id));
  }
});

test("sanitized article IDs and local links remain consistent, including encoded Japanese fragments", () => {
  const result = sanitizeNewsHtml('<h2 id="schedule">予定</h2><a href="#schedule">目次</a><h2 id="公演">公演</h2><a href="#%E5%85%AC%E6%BC%94">目次</a>');
  assert.match(result, /id="user-content-schedule"/);
  assert.match(result, /href="#user-content-schedule"/);
  assert.match(result, /id="user-content-公演"/);
  assert.match(result, /href="#user-content-%E5%85%AC%E6%BC%94"/);
});

test("redirects are rejected without forwarding the API key to a second host", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://evil.test" } });
  });
  await assert.rejects(fetchCmsJson(resolveCmsEndpoint("demo", "news"), "test-only-key", AbortSignal.timeout(1000)));
  assert.equal(calls, 1);
});

test("oversized bodies with and without Content-Length are rejected", async (t) => {
  for (const headers of [{ "Content-Length": "3000000" }, {}]) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers }));
    await assert.rejects(fetchCmsJson(resolveCmsEndpoint("demo", "news"), "test-only-key", AbortSignal.timeout(1000)));
    mock.mock.restore();
  }
});

test("a slow CMS response is aborted by its shared deadline", async (t) => {
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const timer = setTimeout(() => {}, 1000);
  try { await assert.rejects(fetchCmsJson(resolveCmsEndpoint("demo", "news"), "test-only-key", AbortSignal.timeout(20))); }
  finally { clearTimeout(timer); }
});

test("news pagination preserves good records and malformed records cannot break rendering", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ contents: [news, { ...news, content: {} }, null], totalCount: 3 }));
  const result = await fetchNews(10, cmsEnv);
  assert.equal(result.source, "microcms");
  assert.deepEqual(result.items, [news]);
});

test("CMS detail rejects route confusion, wrong record IDs and invalid config with a safe fallback", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json(news); });
  assert.deepEqual(await fetchNewsById("news-1", cmsEnv), { ...news, category: undefined });
  assert.equal(await fetchNewsById("news-2", cmsEnv), null);
  assert.equal(await fetchNewsById("..", cmsEnv), null);
  assert.equal(await fetchNewsById("news-1", { ...cmsEnv, MICROCMS_SERVICE_DOMAIN: "https://evil.test" }), null);
  assert.equal(calls, 2);
});

test("gallery retains HTTPS images and drops dangerous URLs and malformed records", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ contents: [null, { id: "photo-1", title: "舞台", gallery: [{ url: "javascript:alert(1)" }, { url: "https://images.microcms-assets.io/test.jpg", width: 800, height: 600 }] }] }));
  const result = await fetchGallery(8, cmsEnv);
  assert.equal(result.source, "microcms");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].imageWidth, 800);
});

test("upstream failures and pagination overflow return safe fallback data", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  assert.equal((await fetchNews(1, cmsEnv)).source, "fallback");
  assert.equal((await fetchGallery(8, cmsEnv)).source, "fallback");
  mock.mock.restore();
  t.mock.method(globalThis, "fetch", async () => Response.json({ contents: [news, news], totalCount: 2 }));
  assert.equal((await fetchNews(1, cmsEnv)).source, "fallback");
});

test("an invalid full page does not hide valid records on subsequent pages", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ contents: ++calls === 1 ? Array(100).fill(null) : [news], totalCount: 101 }));
  const result = await fetchNews(undefined, cmsEnv);
  assert.deepEqual(result.items, [news]);
  assert.equal(calls, 2);
});

test("pagination cannot retain more than the shared four MiB response budget", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ contents: Array(100).fill({ ...news, content: "x".repeat(10_000) }), totalCount: 1000 });
  });
  assert.equal((await fetchNews(undefined, cmsEnv)).source, "fallback");
  assert.equal(calls, 5);
});
