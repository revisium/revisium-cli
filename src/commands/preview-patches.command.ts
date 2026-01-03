import { Option, SubCommand } from 'nest-commander';
import { BasePatchCommand, PatchOptions } from './base-patch.command';
import { PatchDiffService } from '../services/patch-diff.service';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { ConnectionService } from '../services/connection.service';
import { formatDiffAsTable } from '../utils/diff-formatter.utils';

@SubCommand({
  name: 'preview',
  description: 'Preview diff between patches and current API data',
})
export class PreviewPatchesCommand extends BasePatchCommand {
  constructor(
    loaderService: PatchLoaderService,
    validationService: PatchValidationService,
    diffService: PatchDiffService,
    connectionService: ConnectionService,
  ) {
    super(loaderService, validationService, diffService, connectionService);
  }

  async run(_inputs: string[], options: PatchOptions): Promise<void> {
    const result = await this.loadAndValidatePatches(options);

    if (!result) {
      return;
    }

    const { diff } = result;

    console.log(formatDiffAsTable(diff));
    console.log(`\n📊 Summary:`);
    console.log(`  Total rows: ${diff.summary.totalRows}`);
    console.log(`  🔄 Changes: ${diff.summary.totalChanges}`);
    console.log(`  ⏭️  Skipped: ${diff.summary.skipped}`);
    console.log(`  ❌ Errors: ${diff.summary.errors}`);
  }

  @Option({
    flags: '--input <path>',
    description: 'Input folder or file with patch files',
    required: true,
  })
  parseInput(value: string): string {
    return value;
  }
}
