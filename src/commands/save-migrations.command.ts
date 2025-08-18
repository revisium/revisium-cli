import { writeFile } from 'fs/promises';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';

type Options = {
  file: string;
  organization?: string;
  project?: string;
  branch?: string;
};

@SubCommand({
  name: 'save',
  description: 'Save migrations to file',
})
export class SaveMigrationsCommand extends CommandRunner {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    try {
      if (!options.file) {
        console.error('Error: --file option is required');
        process.exit(1);
      }

      await this.coreApiService.login();
      const revisionId =
        await this.draftRevisionService.getDraftRevisionId(options);
      await this.saveFile(revisionId, options.file);
    } catch (error) {
      console.error(error);
    }
  }

  private async saveFile(revisionId: string, filePath: string) {
    try {
      const result = await this.api.migrations(revisionId);

      await writeFile(filePath, JSON.stringify(result.data, null, 2), 'utf-8');

      console.log(`✅ Save migrations to: ${filePath}`);
    } catch (error) {
      console.error(
        'Error reading or parsing file:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  @Option({
    flags: '-f, --file <file>',
    description: 'file to save migrations',
    required: true,
  })
  parseFile(val: string) {
    return val;
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-o, --organization <organization>',
    description: 'organization name',
    required: false,
  })
  parseOrganization(val: string) {
    return val;
  }

  @Option({
    flags: '-p, --project <project>',
    description: 'project name',
    required: false,
  })
  parseProject(val: string) {
    return val;
  }

  @Option({
    flags: '-b, --branch <branch>',
    description: 'branch name',
    required: false,
  })
  parseBranch(val: string) {
    return val;
  }
}
