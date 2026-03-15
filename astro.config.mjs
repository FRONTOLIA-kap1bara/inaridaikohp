// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

const isProductionBuild = process.env.NODE_ENV === "production";

export default defineConfig({
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
