import { defineConfig } from 'vitest/config';

// The browser tests share one build of the Studio (made once by the global setup) and run one file at a time, so no
// test serves dist/ while another rebuilds it, and the browsers do not compete for the machine.
export default defineConfig({
  test: {
    globalSetup: ['./test/setup.ts'],
    fileParallelism: false,
  },
});
