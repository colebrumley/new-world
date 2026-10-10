import { rmSync } from 'node:fs';

/** Remove this run's build (playwright.config.ts names it) once the tests are over. */
export default function teardown(): void {
  const outDir = process.env['PW_OUT_DIR'];
  if (outDir) rmSync(outDir, { recursive: true, force: true });
}
