import { Injectable } from '@nestjs/common';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

@Injectable()
export class LoggerService {
  info(message: string): void {
    console.log(message);
  }

  success(message: string): void {
    console.log(`✅ ${message}`);
  }

  warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  error(message: string): void {
    console.error(`❌ ${message}`);
  }

  table(tableId: string, message: string): void {
    console.log(`📋 ${tableId}: ${message}`);
  }

  processingTable(tableId: string): void {
    console.log(`📋 Processing table: ${tableId}`);
  }

  foundItems(count: number, itemType: string): void {
    console.log(`📊 Found ${count} ${itemType}`);
  }

  summary(title: string): void {
    console.log(`\n🎉 ${title}`);
  }

  section(title: string): void {
    console.log(`\n${title}`);
  }

  indent(message: string, level = 1): void {
    const indent = '  '.repeat(level);
    console.log(`${indent}${message}`);
  }

  indentWarn(message: string, level = 1): void {
    const indent = '  '.repeat(level);
    console.warn(`${indent}⚠️  ${message}`);
  }

  indentError(message: string, level = 1): void {
    const indent = '  '.repeat(level);
    console.error(`${indent}❌ ${message}`);
  }

  lines(messages: string[]): void {
    for (const msg of messages) {
      console.log(msg);
    }
  }

  errorLines(messages: string[]): void {
    for (const msg of messages) {
      console.error(msg);
    }
  }

  commit(): void {
    console.log('💾 Creating revision...');
  }

  commitSuccess(revisionId: string): void {
    console.log(`✅ Created revision: ${revisionId}`);
  }

  commitError(message: string): void {
    console.error(`❌ Failed to create revision: ${message}`);
  }

  connecting(label: string, url: string): void {
    console.log(`\nConnecting to ${label}: ${url}`);
  }

  connected(message: string): void {
    console.log(`  ✓ ${message}`);
  }

  authenticated(username: string): void {
    console.log(`  ✓ Authenticated as ${username}`);
  }

  syncSection(title: string): void {
    console.log(`\n📋 ${title}`);
  }

  syncSuccess(message: string): void {
    console.log(`  ✓ ${message}`);
  }

  syncTable(tableId: string): void {
    console.log(`  📋 Processing table: ${tableId}`);
  }

  syncFound(count: number, itemType: string): void {
    console.log(`    📊 Found ${count} ${itemType}`);
  }

  syncResult(tableId: string, details: string): void {
    console.log(`  ✅ ${tableId}: ${details}`);
  }

  dryRunSection(): void {
    console.log('\n  📊 Dry run analysis:');
  }

  dryRunResult(message: string): void {
    console.log(`    ${message}`);
  }

  migrationApplied(id: string): void {
    console.log(`✅ Migration applied: ${id}`);
  }

  migrationSkipped(id: string): void {
    console.log(`⏭️  Migration already applied: ${id}`);
  }

  migrationFailed(response: unknown): void {
    console.error('❌ Migration failed:', response);
  }

  migrationCreated(tableId: string, id: string): void {
    console.log(`📦 Created migration for table: ${tableId} (${id})`);
  }
}
