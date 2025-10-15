import { Injectable } from '@nestjs/common';
import { getValueByPath, hasPath } from '@revisium/schema-toolkit/lib';
import { JsonValue } from '@revisium/schema-toolkit/types';
import { JsonValuePatch } from '@revisium/schema-toolkit/types';

@Injectable()
export class PatchGeneratorService {
  public generatePatches(row: unknown, paths: string[]): JsonValuePatch[] {
    const patches: JsonValuePatch[] = [];

    for (const path of paths) {
      if (!hasPath(row as JsonValue, path)) {
        continue;
      }

      const value = getValueByPath(row as JsonValue, path);

      patches.push({
        op: 'replace',
        path,
        value: value as JsonValue,
      });
    }

    return patches;
  }
}
