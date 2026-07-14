import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Disable parallelism because integration tests share the same Redis keys 
    // and PostgreSQL tables.
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
