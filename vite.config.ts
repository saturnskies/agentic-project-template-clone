/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://saturnskies.github.io/swapsmith/ (see ADR-001).
  base: '/swapsmith/',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
