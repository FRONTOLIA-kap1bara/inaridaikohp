// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
const isProductionBuild = process.env.NODE_ENV === "production";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  ...(isProductionBuild
    ? {
        output: "server",
        adapter: cloudflare()
      }
    : {})
});
