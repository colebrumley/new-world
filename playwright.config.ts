import { defineConfig, devices } from '@playwright/test';

// Every run builds the game into a folder of its own and serves it on a port of its own, so that
// several runs on one machine (other checkouts, other sessions in this one) never test each
// other's build. The runner picks the port; its workers read the same one from the environment.
const local = !process.env['CI'];
// 20000-29999 holds none of the ports Chromium refuses to open (ERR_UNSAFE_PORT) and lies below the
// range the system hands out for outgoing connections.
const port = Number((process.env['PW_PORT'] ??= String(20000 + (process.pid % 10000))));
/** Ports from 1024 up that Chromium will not navigate to (net/base/port_util.cc). */
const UNSAFE_PORTS = [1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080];
if (!Number.isInteger(port) || port < 1024 || port > 65535 || UNSAFE_PORTS.includes(port)) {
  throw new Error(`PW_PORT=${process.env['PW_PORT']} cannot be used: give a whole number from 1024 to 65535 that Chromium will open`);
}
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
