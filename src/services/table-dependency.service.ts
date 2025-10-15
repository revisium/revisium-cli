import { Injectable } from '@nestjs/common';
import { JsonSchema } from 'src/types/schema.types';

interface TableDependency {
  tableId: string;
  dependsOn: string[];
}

interface DependencyAnalysisResult {
  sortedTables: string[];
  circularDependencies: string[][];
  warnings: string[];
}

@Injectable()
export class TableDependencyService {
  /**
   * Analyzes table schemas and returns tables sorted by dependency order
   * Tables with no dependencies come first, then tables that depend on them, etc.
   */
  public analyzeDependencies(
    tableSchemas: Record<string, JsonSchema>,
  ): DependencyAnalysisResult {
    const dependencies = this.extractDependencies(tableSchemas);
    const circularDependencies = this.detectCircularDependencies(dependencies);
    const sortedTables = this.topologicalSort(
      dependencies,
      circularDependencies,
    );
    const warnings = this.generateWarnings(circularDependencies);

    return {
      sortedTables,
      circularDependencies,
      warnings,
    };
  }

  /**
   * Extracts foreign key dependencies from table schemas
   */
  private extractDependencies(
    tableSchemas: Record<string, JsonSchema>,
  ): TableDependency[] {
    const dependencies: TableDependency[] = [];

    for (const [tableId, schema] of Object.entries(tableSchemas)) {
      const dependsOn = this.findForeignKeyReferences(schema);
      dependencies.push({
        tableId,
        dependsOn: dependsOn.filter((dependency) => dependency !== tableId), // Remove self-references
      });
    }

    return dependencies;
  }

  /**
   * Recursively searches schema for foreignKey references
   */
  private findForeignKeyReferences(schema: JsonSchema | null): string[] {
    const foreignKeys: string[] = [];

    if (schema === null) {
      return foreignKeys;
    }

    // Check if current level has foreignKey
    if ('foreignKey' in schema && typeof schema.foreignKey === 'string') {
      foreignKeys.push(schema.foreignKey);
    }

    // Recursively check properties
    if ('properties' in schema && schema.properties) {
      for (const property of Object.values(schema.properties)) {
        foreignKeys.push(...this.findForeignKeyReferences(property));
      }
    }

    // Check array items
    if ('items' in schema && schema.items) {
      foreignKeys.push(...this.findForeignKeyReferences(schema.items));
    }

    return [...new Set(foreignKeys)]; // Remove duplicates
  }

  /**
   * Detects circular dependencies using DFS
   */
  private detectCircularDependencies(
    dependencies: TableDependency[],
  ): string[][] {
    const circularDependencies: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const dependencyMap = new Map<string, string[]>();

    // Build dependency map
    for (const dep of dependencies) {
      dependencyMap.set(dep.tableId, dep.dependsOn);
    }

    // DFS to detect cycles
    const dfs = (tableId: string, path: string[]): void => {
      if (recursionStack.has(tableId)) {
        // Found a cycle - extract the circular part
        const cycleStart = path.indexOf(tableId);
        const cycle = path.slice(cycleStart);
        cycle.push(tableId);
        circularDependencies.push(cycle);
        return;
      }

      if (visited.has(tableId)) {
        return;
      }

      visited.add(tableId);
      recursionStack.add(tableId);
      path.push(tableId);

      const deps = dependencyMap.get(tableId) || [];
      for (const dep of deps) {
        if (dependencyMap.has(dep)) {
          // Only follow dependencies for tables we have schemas for
          dfs(dep, [...path]);
        }
      }

      recursionStack.delete(tableId);
    };

    // Check each table
    for (const dep of dependencies) {
      if (!visited.has(dep.tableId)) {
        dfs(dep.tableId, []);
      }
    }

    return circularDependencies;
  }

  /**
   * Performs topological sort with handling of circular dependencies
   */
  private topologicalSort(
    dependencies: TableDependency[],
    circularDependencies: string[][],
  ): string[] {
    const dependencyMap = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const circularTables = new Set<string>();

    // Collect all circular tables
    for (const cycle of circularDependencies) {
      for (const table of cycle) {
        circularTables.add(table);
      }
    }

    // Build dependency map and calculate in-degrees
    for (const dep of dependencies) {
      dependencyMap.set(dep.tableId, dep.dependsOn);
      inDegree.set(dep.tableId, 0);
    }

    // Calculate in-degrees (excluding circular dependencies to break cycles)
    for (const dep of dependencies) {
      for (const target of dep.dependsOn) {
        if (inDegree.has(target)) {
          // Skip edges that are part of circular dependencies
          if (circularTables.has(dep.tableId) && circularTables.has(target)) {
            continue;
          }
          // Increment in-degree for the dependent table, not the dependency
          inDegree.set(dep.tableId, (inDegree.get(dep.tableId) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm for topological sorting
    const result: string[] = [];
    const queue: string[] = [];

    // Find all tables with no dependencies
    for (const [tableId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(tableId);
      }
    }

    while (queue.length > 0) {
      const currentTable = queue.shift()!;
      result.push(currentTable);

      // Find all tables that depend on the current table
      for (const [tableId, deps] of dependencyMap.entries()) {
        if (deps.includes(currentTable)) {
          if (inDegree.has(tableId)) {
            // Skip edges that are part of circular dependencies
            if (
              circularTables.has(currentTable) &&
              circularTables.has(tableId)
            ) {
              continue;
            }

            const newDegree = (inDegree.get(tableId) || 0) - 1;
            inDegree.set(tableId, newDegree);

            if (newDegree === 0) {
              queue.push(tableId);
            }
          }
        }
      }
    }

    // Add any remaining circular tables at the end
    for (const tableId of circularTables) {
      if (!result.includes(tableId)) {
        result.push(tableId);
      }
    }

    return result;
  }

  /**
   * Generates warning messages for circular dependencies
   */
  private generateWarnings(circularDependencies: string[][]): string[] {
    const warnings: string[] = [];

    for (const cycle of circularDependencies) {
      const cycleString = cycle.join(' → ');
      warnings.push(
        `⚠️  Circular dependency detected: ${cycleString}. Upload order may cause foreign key constraint errors.`,
      );
    }

    if (circularDependencies.length > 0) {
      warnings.push(
        `💡 Consider breaking circular dependencies or uploading data in multiple passes.`,
      );
    }

    return warnings;
  }

  /**
   * Formats dependency analysis for logging
   */
  public formatDependencyInfo(
    result: DependencyAnalysisResult,
    originalOrder: string[],
  ): string {
    const lines: string[] = [];

    lines.push('🔗 Table Dependency Analysis:');

    if (result.sortedTables.length > 0) {
      lines.push(`📋 Upload order: ${result.sortedTables.join(' → ')}`);

      const reordered = !this.arraysEqual(originalOrder, result.sortedTables);
      if (reordered) {
        lines.push(`📊 Original order: ${originalOrder.join(' → ')}`);
        lines.push('✅ Tables reordered based on foreign key dependencies');
      } else {
        lines.push(
          'ℹ️  No reordering needed - tables already in correct order',
        );
      }
    }

    if (result.circularDependencies.length > 0) {
      lines.push(
        `🔄 Found ${result.circularDependencies.length} circular dependencies`,
      );
    }

    return lines.join('\n');
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
  }
}
