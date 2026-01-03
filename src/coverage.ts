export function saveCoverage() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const globalCoverage = (globalThis as any).__coverage__ as
    | Record<string, unknown>
    | undefined;
  if (globalCoverage && process.env.NYC_OUTPUT_DIR) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    const outputDir = process.env.NYC_OUTPUT_DIR;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const coverageFile = path.join(
      outputDir,
      `coverage-${process.pid}-${Date.now()}.json`,
    );
    fs.writeFileSync(coverageFile, JSON.stringify(globalCoverage));
  }
}
