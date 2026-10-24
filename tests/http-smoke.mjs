import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://127.0.0.1:4322";
let checks = 0;
for (const [path, status] of [["/", 200], ["/news", 200], ["/about", 200], ["/rss.xml", 200], ["/sitemap.xml", 200], ["/robots.txt", 200], ["/news/security-test-missing", 404], ["/.env", 404], ["/.dev.vars", 404], ["/server/.dev.vars", 404]]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, status, path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  assert.equal(response.headers.get("x-frame-options"), "DENY", path);
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/html") && status === 200) {
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src[^;,]*'sha256-/, `${path}: script hashes must remain in SSR headers`);
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.doesNotMatch(csp.match(/script-src[^;,]*/)?.[0] ?? "", /'unsafe-inline'|'unsafe-eval'/, path);
    for (const match of body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
    const asset = /(?:href|src)="(\/_astro\/[^"?]+\.(?:css|js))"/.exec(body)?.[1];
    if (asset) {
      const assetResponse = await fetch(new URL(asset, base));
      assert.equal(assetResponse.status, 200, asset);
      assert.equal(assetResponse.headers.get("x-content-type-options"), "nosniff", asset);
      await assetResponse.body?.cancel();
    }
  }
  if (path.endsWith(".xml")) assert.match(body, /^<\?xml/);
  checks++;
}
console.log(`HTTP smoke checks passed: ${checks} routes, SSR CSP, JSON-LD, static assets and secret-file protection`);
