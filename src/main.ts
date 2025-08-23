#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import * as process from 'node:process';
import { AppModule } from './app.module';
import * as packageJson from 'package.json';

type PackageJson = {
  version: string;
};

async function bootstrap() {
  try {
    await CommandFactory.runWithoutClosing(AppModule, {
      version: (packageJson as PackageJson).version,
    });
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

bootstrap()
  .then((code) => {
    process.exit(code);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
