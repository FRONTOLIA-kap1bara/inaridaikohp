import type { APIRoute } from "astro";

export const GET: APIRoute = ({ url }) => {
  const origin = `${url.protocol}//${url.host}`;
  const body = [
    `User-agent: *`,
    `Allow: /`,
    `Sitemap: ${origin}/sitemap.xml`,
    `Host: ${url.host}`
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
};
