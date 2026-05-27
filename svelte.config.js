import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*']
        // No exclude — all routes go through the worker for SSR.
        // The '<all>' exclude that was here previously prevented any
        // server-side load functions from running, including public profiles.
      }
    }),
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;
