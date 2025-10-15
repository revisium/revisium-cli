import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from './base.command';
import { PatchDiffService } from '../services/patch-diff.service';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { CoreApiService } from '../services/core-api.service';
import { DraftRevisionService } from '../services/draft-revision.service';
import { formatDiffAsTable } from '../utils/diff-formatter.utils';

type Options = BaseOptions & {
  input: string;
  onlyChanges?: boolean;
};

@SubCommand({
  name: 'preview',
  description: 'Preview diff between patches and current API data',
})
export class PreviewPatchesCommand extends BaseCommand {
  constructor(
    private readonly diffService: PatchDiffService,
    private readonly loaderService: PatchLoaderService,
    private readonly validationService: PatchValidationService,
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.input) {
      throw new Error('Error: --input option is required');
    }

    await this.coreApiService.tryToLogin(options);

    console.log(`🔍 Loading patches from ${options.input}...`);
    const patches = await this.loaderService.loadPatches(options.input);
    console.log(`✅ Loaded ${patches.length} patch file(s)\n`);

    const revisionId =
      await this.draftRevisionService.getDraftRevisionId(options);

    console.log('🔍 Validating patches...');
    const results = await this.validationService.validateAllWithRevisionId(
      patches,
      revisionId,
    );

    let hasErrors = false;
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      const result = results[i];

      if (!result.valid) {
        console.error(
          `❌ Validation failed for ${patch.table}/${patch.rowId}:`,
        );
        for (const error of result.errors) {
          const errorPath = error.path ? ` [${error.path}]` : '';
          console.error(`   - ${error.message}${errorPath}`);
        }
        hasErrors = true;
      }
    }

    if (hasErrors) {
      console.error('\n❌ Validation failed. Fix errors before previewing.');
      process.exit(1);
    }

    console.log('✅ Validation passed\n');

    console.log('🔍 Comparing with current data...');

    let diff = await this.diffService.compareWithApi(patches, revisionId);
    console.log(`✅ Compared ${diff.summary.totalRows} row(s)\n`);

    if (options.onlyChanges) {
      diff = this.diffService.getChangesOnly(diff);
    }

    if (diff.summary.totalChanges === 0) {
      console.log(
        '✅ No changes detected. All values are identical to current data.',
      );
      return;
    }

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

  @Option({
    flags: '--only-changes',
    description: 'Show only rows with changes',
  })
  parseOnlyChanges(): boolean {
    return true;
  }
}
