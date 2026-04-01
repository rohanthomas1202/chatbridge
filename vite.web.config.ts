/**
 * Standalone Vite config for web-only builds.
 * Builds just the renderer (frontend) without the Electron main/preload processes.
 * Usage: NODE_OPTIONS="--max-old-space-size=4096" pnpm run build:web
 */

import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import path, { resolve } from 'path'
import { defineConfig } from 'vite'
import { dvhToVh, injectBaseTag, injectReleaseDate, replacePlausibleDomain } from './electron.vite.config'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/renderer/routes',
      generatedRouteTree: './src/renderer/routeTree.gen.ts',
    }),
    react({}),
    dvhToVh(),
    injectBaseTag(),
    injectReleaseDate(),
    replacePlausibleDomain(),
  ],
  build: {
    outDir: resolve(__dirname, 'release/app/dist/renderer'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        // Keep vendor chunks separate to reduce peak memory during rendering
        manualChunks: {
          'vendor-ui': ['@mantine/core', '@mantine/hooks'],
          'vendor-ai': ['ai'],
        },
      },
      external: ['electron'],
    },
  },
  css: {
    modules: { generateScopedName: '[name]__[local]___[hash:base64:5]' },
    postcss: resolve(__dirname, 'postcss.config.cjs'),
  },
  define: {
    'process.type': '"renderer"',
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.CHATBOX_BUILD_TARGET': '"web"',
    'process.env.CHATBOX_BUILD_PLATFORM': '"web"',
    'process.env.CHATBOX_BUILD_CHANNEL': '"release"',
    'process.env.USE_LOCAL_API': '""',
    'process.env.USE_BETA_API': '""',
  },
  optimizeDeps: {
    include: ['mermaid'],
    esbuildOptions: { target: 'es2015' },
  },
})
