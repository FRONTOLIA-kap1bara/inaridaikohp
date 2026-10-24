// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

const site = process.env.PUBLIC_SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  output: "server",
  adapter: cloudflare(),
  // Preserve the existing whitespace layout when migrating to Astro 7.
  compressHTML: true,
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "form-action 'none'",
        "img-src 'self' https: data:",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-src https://www.instagram.com https://www.youtube.com https://www.youtube-nocookie.com",
        "connect-src 'self'"
      ],
      // GSAP and the rich text editor use inline style attributes.
      styleDirective: { resources: [
        { resource: "'self'", kind: "element" },
        { resource: "https://fonts.googleapis.com", kind: "element" },
        { resource: "'unsafe-inline'", kind: "attribute" }
      ] }
    }
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
