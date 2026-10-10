import { defineConfig, devices } from '@playwright/test';

// Every run builds the game into a folder of its own and serves it on a port of its own, so that
// several runs on one machine (other checkouts, other sessions in this one) never test each
// other's build. The runner picks the port; its workers read the same one from the environment.
const local = !process.env['CI'];
const port = Number((process.env['PW_PORT'] ??= String(4200 + (process.pid % 2000))));
const outDir = `node_modules/.cache/new-world-e2e/${port}`;
process.env['PW_OUT_DIR'] = outDir;

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  reporter: 'list',
  // Local runs share the machine: a few workers each, and a run that goes wrong stops early.
  workers: local ? Number(process.env['PW_WORKERS'] ?? 2) : undefined,
  maxFailures: local ? 3 : 0,
  globalTimeout: local ? 5 * 60_000 : 0,
  expect: { timeout: local ? 10_000 : 5_000 },
  globalTeardown: './test/e2e/teardown.ts',
  // text snapshots are the same on every platform
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npx vite build --outDir ${outDir} && npx vite preview --outDir ${outDir} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
