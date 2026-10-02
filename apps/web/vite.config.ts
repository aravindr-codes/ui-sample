import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Must run before the React plugin so generated route code gets transformed.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      routeFileIgnorePattern: '\\.test\\.',
    }),
    react(),
  ],
  build: {
    sourcemap: true,
    target: 'es2023',
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: framework code stays cached across app deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 40 },
            { name: 'mui-grid', test: /node_modules[\\/]@mui[\\/]x-/, priority: 25 },
            {
              name: 'mui',
              test: /node_modules[\\/](@mui[\\/](?!x-)|@emotion[\\/]|@popperjs[\\/]|react-transition-group[\\/])/,
              priority: 35,
            },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            { name: 'forms', test: /node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
