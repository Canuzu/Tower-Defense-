import { defineConfig } from 'vite';

// SINGLE=1 builds a self-contained bundle (fonts inlined, one JS chunk) for the one-file web build.
const single = !!process.env.SINGLE;

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: single ? 'dist-single' : 'dist',
    assetsInlineLimit: single ? 100_000_000 : 0,
    cssCodeSplit: !single,
    rollupOptions: single ? { output: { inlineDynamicImports: true } } : undefined,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
