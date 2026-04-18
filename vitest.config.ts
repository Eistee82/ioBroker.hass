import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        globals: false,
        testTimeout: 10_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['build/**', 'node_modules/**', 'tests/**', '.dev-server/**'],
        },
    },
});
