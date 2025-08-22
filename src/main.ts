#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';
import * as packageJson from 'package.json';

type PackageJson = {
  version: string;
};

async function bootstrap() {
  await CommandFactory.run(AppModule, {
    version: (packageJson as PackageJson).version,
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
