// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

const isProductionBuild = process.env.NODE_ENV === "production";
const site = process.env.PUBLIC_SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  output: "server",
  ...(isProductionBuild
    ? {
        adapter: cloudflare()
      }
    : {}),
  vite: {
    plugins: [tailwindcss()]
  }
});
