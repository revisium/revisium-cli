import { Injectable } from '@nestjs/common';
import { SyncApiService, ConnectionInfo } from './sync-api.service';
import { SchemaSyncResult } from '../types/sync.types';
import { Migration } from '../types/migration.types';

@Injectable()
export class SyncSchemaService {
  constructor(private readonly syncApi: SyncApiService) {}

  async sync(dryRun: boolean = false): Promise<SchemaSyncResult> {
    const source = this.syncApi.source;
    const target = this.syncApi.target;

    console.log('\n📋 Syncing schema...');

    const migrations = await this.getMigrations(source);

    if (migrations.length === 0) {
      console.log('  ✓ No migrations found in source');
      return {
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      };
    }

    console.log(`  Found ${migrations.length} migration(s) in source`);

    if (dryRun) {
      return this.analyzeMigrations(migrations);
    }

    return this.applyMigrations(target, migrations);
  }

  private async getMigrations(
    connection: ConnectionInfo,
  ): Promise<Migration[]> {
    const result = await connection.client.api.migrations(
      connection.revisionId,
    );

    if (result.error) {
      throw new Error(
        `Failed to get migrations: ${JSON.stringify(result.error)}`,
      );
    }

    return result.data as Migration[];
  }

  private analyzeMigrations(migrations: Migration[]): SchemaSyncResult {
    const tablesCreated: string[] = [];
    const tablesUpdated: string[] = [];
    const tablesRemoved: string[] = [];

    for (const migration of migrations) {
      if (migration.changeType === 'init') {
        tablesCreated.push(migration.tableId);
      } else if (migration.changeType === 'update') {
        tablesUpdated.push(migration.tableId);
      } else if (migration.changeType === 'remove') {
        tablesRemoved.push(migration.tableId);
      } else if (migration.changeType === 'rename') {
        tablesUpdated.push(`${migration.tableId} → ${migration.nextTableId}`);
      }
    }

    console.log('\n  📊 Dry run summary:');
    if (tablesCreated.length > 0) {
      console.log(`    Tables to create: ${tablesCreated.join(', ')}`);
    }
    if (tablesUpdated.length > 0) {
      console.log(`    Tables to update: ${tablesUpdated.join(', ')}`);
    }
    if (tablesRemoved.length > 0) {
      console.log(`    Tables to remove: ${tablesRemoved.join(', ')}`);
    }

    return {
      migrationsApplied: 0,
      tablesCreated,
      tablesUpdated,
      tablesRemoved,
    };
  }

  private async applyMigrations(
    connection: ConnectionInfo,
    migrations: Migration[],
  ): Promise<SchemaSyncResult> {
    const tablesCreated: string[] = [];
    const tablesUpdated: string[] = [];
    const tablesRemoved: string[] = [];
    let migrationsApplied = 0;

    for (const migration of migrations) {
      const result = await connection.client.api.applyMigrations(
        connection.draftRevisionId,
        [migration],
      );

      if (result.error) {
        throw new Error(
          `Failed to apply migration: ${JSON.stringify(result.error)}`,
        );
      }

      const response = result.data[0];

      if (response.status === 'failed') {
        throw new Error(
          `Migration ${response.id} failed: ${response.error || 'Unknown error'}`,
        );
      }

      if (response.status === 'applied') {
        migrationsApplied++;

        if (migration.changeType === 'init') {
          tablesCreated.push(migration.tableId);
          console.log(`    ✓ Created table: ${migration.tableId}`);
        } else if (migration.changeType === 'update') {
          tablesUpdated.push(migration.tableId);
          console.log(`    ✓ Updated table: ${migration.tableId}`);
        } else if (migration.changeType === 'remove') {
          tablesRemoved.push(migration.tableId);
          console.log(`    ✓ Removed table: ${migration.tableId}`);
        } else if (migration.changeType === 'rename') {
          tablesUpdated.push(`${migration.tableId} → ${migration.nextTableId}`);
          console.log(
            `    ✓ Renamed table: ${migration.tableId} → ${migration.nextTableId}`,
          );
        }
      } else if (response.status === 'skipped') {
        console.log(`    ⏭️  Skipped: ${response.id}`);
      }
    }

    console.log(`  ✓ Applied ${migrationsApplied} migration(s)`);

    return {
      migrationsApplied,
      tablesCreated,
      tablesUpdated,
      tablesRemoved,
    };
  }
}
