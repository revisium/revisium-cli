import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { stopDocker } from '../utils/docker-helper';

const ENV_FILE = path.join(process.cwd(), '.e2e-env.json');

export default function globalTeardown(): void {
  console.log('\n========================================');
  console.log('E2E Global Teardown');
  console.log('========================================\n');

  // 1. Stop Docker containers
  stopDocker();

  // 2. Merge coverage if E2E coverage exists
  const nycOutputDir = path.join(process.cwd(), '.nyc_output');
  if (fs.existsSync(nycOutputDir)) {
    const files = fs
      .readdirSync(nycOutputDir)
      .filter((f) => f.endsWith('.json'));
    if (files.length > 0) {
      console.log(`\nMerging ${files.length} E2E coverage files...`);
      try {
        execSync('npx nyc report --reporter=json --report-dir=coverage/e2e', {
          stdio: 'inherit',
        });
        console.log('E2E coverage saved to coverage/e2e/');
      } catch (error) {
        console.warn('Failed to generate E2E coverage report:', error);
      }
    }
  }

  // 3. Cleanup env file
  if (fs.existsSync(ENV_FILE)) {
    fs.rmSync(ENV_FILE);
    console.log(`\nCleaned up ${ENV_FILE}`);
  }

  console.log('\n========================================');
  console.log('E2E Teardown Complete');
  console.log('========================================\n');
}
