import { Injectable } from '@nestjs/common';
import { SyncApiService, ConnectionInfo } from './sync-api.service';
import { LoggerService } from './logger.service';
import { SchemaSyncResult } from '../types/sync.types';
import { Migration } from '../types/migration.types';

@Injectable()
export class SyncSchemaService {
  constructor(
    private readonly syncApi: SyncApiService,
    private readonly logger: LoggerService,
  ) {}

  async sync(dryRun: boolean = false): Promise<SchemaSyncResult> {
    const source = this.syncApi.source;
    const target = this.syncApi.target;

    this.logger.syncSection('Syncing schema...');

    const migrations = await this.getMigrations(source);

    if (migrations.length === 0) {
      this.logger.syncSuccess('No migrations found in source');
      return {
        migrationsApplied: 0,
        tablesCreated: [],
        tablesUpdated: [],
        tablesRemoved: [],
      };
    }

    this.logger.indent(`Found ${migrations.length} migration(s) in source`);

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

    this.logger.dryRunSection();
    if (tablesCreated.length > 0) {
      this.logger.dryRunResult(`Tables to create: ${tablesCreated.join(', ')}`);
    }
    if (tablesUpdated.length > 0) {
      this.logger.dryRunResult(`Tables to update: ${tablesUpdated.join(', ')}`);
    }
    if (tablesRemoved.length > 0) {
      this.logger.dryRunResult(`Tables to remove: ${tablesRemoved.join(', ')}`);
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
          this.logger.indent(`✓ Created table: ${migration.tableId}`, 2);
        } else if (migration.changeType === 'update') {
          tablesUpdated.push(migration.tableId);
          this.logger.indent(`✓ Updated table: ${migration.tableId}`, 2);
        } else if (migration.changeType === 'remove') {
          tablesRemoved.push(migration.tableId);
          this.logger.indent(`✓ Removed table: ${migration.tableId}`, 2);
        } else if (migration.changeType === 'rename') {
          tablesUpdated.push(`${migration.tableId} → ${migration.nextTableId}`);
          this.logger.indent(
            `✓ Renamed table: ${migration.tableId} → ${migration.nextTableId}`,
            2,
          );
        }
      } else if (response.status === 'skipped') {
        this.logger.indent(`⏭️  Skipped: ${response.id}`, 2);
      }
    }

    this.logger.syncSuccess(`Applied ${migrationsApplied} migration(s)`);

    return {
      migrationsApplied,
      tablesCreated,
      tablesUpdated,
      tablesRemoved,
    };
  }
}
