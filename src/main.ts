#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import * as process from 'node:process';
import { AppModule } from './app.module';
import * as packageJson from '../package.json';

type PackageJson = {
  version: string;
};

let hasError = false;

async function bootstrap() {
  try {
    await CommandFactory.runWithoutClosing(AppModule, {
      version: (packageJson as PackageJson).version,
      logger: ['error', 'warn'],
      errorHandler: (err: Error) => {
        console.error(err.message);
        hasError = true;
      },
      serviceErrorHandler: (err: Error) => {
        console.error(err.message);
        hasError = true;
      },
    });
    return hasError ? 1 : 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

async function exitWithCoverage(code: number) {
  if (process.env.NYC_OUTPUT_DIR) {
    const { saveCoverage } = await import('./coverage');
    saveCoverage();
  }
  process.exit(code);
}

bootstrap()
  .then((code) => exitWithCoverage(code))
  .catch((e) => {
    console.error(e);
    void exitWithCoverage(1);
  });
