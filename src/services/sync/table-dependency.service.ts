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
    const circularTables = this.collectCircularTables(circularDependencies);
    const dependencyMap = this.buildDependencyMap(dependencies);
    const inDegree = this.calculateInDegrees(dependencies, circularTables);

    const result = this.runKahnsAlgorithm(
      dependencyMap,
      inDegree,
      circularTables,
    );

    this.appendRemainingCircularTables(result, circularTables);

    return result;
  }

  private collectCircularTables(circularDependencies: string[][]): Set<string> {
    const circularTables = new Set<string>();
    for (const cycle of circularDependencies) {
      for (const table of cycle) {
        circularTables.add(table);
      }
    }
    return circularTables;
  }

  private buildDependencyMap(
    dependencies: TableDependency[],
  ): Map<string, string[]> {
    const dependencyMap = new Map<string, string[]>();
    for (const dep of dependencies) {
      dependencyMap.set(dep.tableId, dep.dependsOn);
    }
    return dependencyMap;
  }

  private calculateInDegrees(
    dependencies: TableDependency[],
    circularTables: Set<string>,
  ): Map<string, number> {
    const inDegree = new Map<string, number>();

    for (const dep of dependencies) {
      inDegree.set(dep.tableId, 0);
    }

    for (const dep of dependencies) {
      for (const target of dep.dependsOn) {
        if (!inDegree.has(target)) {
          continue;
        }
        if (this.isCircularEdge(dep.tableId, target, circularTables)) {
          continue;
        }
        inDegree.set(dep.tableId, (inDegree.get(dep.tableId) ?? 0) + 1);
      }
    }

    return inDegree;
  }

  private isCircularEdge(
    from: string,
    to: string,
    circularTables: Set<string>,
  ): boolean {
    return circularTables.has(from) && circularTables.has(to);
  }

  private runKahnsAlgorithm(
    dependencyMap: Map<string, string[]>,
    inDegree: Map<string, number>,
    circularTables: Set<string>,
  ): string[] {
    const result: string[] = [];
    const queue: string[] = [];

    for (const [tableId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(tableId);
      }
    }

    while (queue.length > 0) {
      const currentTable = queue.shift()!;
      result.push(currentTable);

      this.updateDependentTables(
        currentTable,
        dependencyMap,
        inDegree,
        circularTables,
        queue,
      );
    }

    return result;
  }

  private updateDependentTables(
    currentTable: string,
    dependencyMap: Map<string, string[]>,
    inDegree: Map<string, number>,
    circularTables: Set<string>,
    queue: string[],
  ): void {
    for (const [tableId, deps] of dependencyMap.entries()) {
      if (!deps.includes(currentTable)) {
        continue;
      }
      if (!inDegree.has(tableId)) {
        continue;
      }
      if (this.isCircularEdge(currentTable, tableId, circularTables)) {
        continue;
      }

      const newDegree = (inDegree.get(tableId) ?? 0) - 1;
      inDegree.set(tableId, newDegree);

      if (newDegree === 0) {
        queue.push(tableId);
      }
    }
  }

  private appendRemainingCircularTables(
    result: string[],
    circularTables: Set<string>,
  ): void {
    for (const tableId of circularTables) {
      if (!result.includes(tableId)) {
        result.push(tableId);
      }
    }
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
        lines.push(
          `📊 Original order: ${originalOrder.join(' → ')}`,
          '✅ Tables reordered based on foreign key dependencies',
        );
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
