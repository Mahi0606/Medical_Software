import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], env: { PHARMA_MIGRATIONS_DIR: new URL('./drizzle', import.meta.url).pathname } } });
