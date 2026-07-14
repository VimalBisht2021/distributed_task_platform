import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Disable parallelism because integration tests share the same Redis keys 
    // and PostgreSQL tables. Running them in parallel causes race conditions 
    // (e.g. one test calling deleteMany() while another test is querying).
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
