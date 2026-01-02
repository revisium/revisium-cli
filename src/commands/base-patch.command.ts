import { BaseCommand, BaseOptions } from './base.command';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { PatchDiffService } from '../services/patch-diff.service';
import { CoreApiService } from '../services/core-api.service';
import { DraftRevisionService } from '../services/draft-revision.service';
import { PatchFile, DiffResult } from '../types/patch.types';

export type PatchOptions = BaseOptions & {
  input: string;
};

export interface ValidatedPatchesResult {
  patches: PatchFile[];
  revisionId: string;
  diff: DiffResult;
}

export abstract class BasePatchCommand extends BaseCommand {
  constructor(
    protected readonly loaderService: PatchLoaderService,
    protected readonly validationService: PatchValidationService,
    protected readonly diffService: PatchDiffService,
    protected readonly coreApiService: CoreApiService,
    protected readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  protected async loadAndValidatePatches(
    options: PatchOptions,
  ): Promise<ValidatedPatchesResult | null> {
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
      console.error('\n❌ Validation failed. Fix errors before proceeding.');
      process.exit(1);
    }

    console.log('✅ Validation passed\n');

    console.log('🔍 Comparing with current data...');
    const diff = await this.diffService.compareWithApi(
      patches,
      revisionId,
      (current, total) => {
        process.stdout.write(`\r  Comparing: ${current}/${total} rows`);
      },
    );
    process.stdout.write('\r\x1b[K');
    console.log(`✅ Compared ${diff.summary.totalRows} row(s)\n`);

    if (diff.summary.totalChanges === 0) {
      console.log(
        '✅ No changes detected. All values are identical to current data.',
      );
      return null;
    }

    return { patches, revisionId, diff };
  }
}
