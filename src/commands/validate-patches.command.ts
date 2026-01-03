import { Option, SubCommand } from 'nest-commander';
import { BaseCommand, BaseOptions } from './base.command';
import { PatchLoaderService } from '../services/patch-loader.service';
import { PatchValidationService } from '../services/patch-validation.service';
import { ConnectionService } from '../services/connection.service';

type Options = BaseOptions & {
  input: string;
};

@SubCommand({
  name: 'validate',
  description: 'Validate patch files against table schema',
})
export class ValidatePatchesCommand extends BaseCommand {
  constructor(
    private readonly loaderService: PatchLoaderService,
    private readonly validationService: PatchValidationService,
    private readonly connectionService: ConnectionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.input) {
      throw new Error('Error: --input option is required');
    }

    console.log(`🔍 Loading patches from ${options.input}...`);
    const patches = await this.loaderService.loadPatches(options.input);
    console.log(`✅ Loaded ${patches.length} patch file(s)\n`);

    await this.connectionService.connect(options);

    console.log('🔍 Validating patch files...');
    let validCount = 0;
    let invalidCount = 0;

    const results = await this.validationService.validateAllWithRevisionId(
      patches,
      this.connectionService.draftRevisionId,
    );

    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      const result = results[i];

      if (result.valid) {
        console.log(`✅ Valid: ${patch.table}/${patch.rowId}`);
        validCount++;
      } else {
        console.log(`❌ Invalid: ${patch.table}/${patch.rowId}`);
        for (const error of result.errors) {
          const errorPath = error.path ? ` [${error.path}]` : '';
          console.log(`   - ${error.message}${errorPath}`);
        }
        invalidCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Valid: ${validCount}`);
    console.log(`  ❌ Invalid: ${invalidCount}`);

    if (invalidCount > 0) {
      console.error('\n❌ Validation failed');
      process.exit(1);
    } else {
      console.log('\n✅ All patches are valid');
    }
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
