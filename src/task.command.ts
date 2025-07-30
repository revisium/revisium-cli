import { Command, CommandRunner, Option } from 'nest-commander';
import { readFile } from 'fs/promises';
import Ajv from 'ajv';

@Command({
  name: 'migrate',
  description: 'Validate and process migration files',
})
export class TaskRunner extends CommandRunner {
  private readonly ajv = new Ajv();
  private readonly schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        hash: { type: 'string' },
        patches: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['date', 'hash', 'patches'],
      additionalProperties: false,
    },
  };

  async run(_inputs: string[], options: Record<string, string>): Promise<void> {
    if (!options.file) {
      console.error('Error: --file option is required');
      process.exit(1);
    }

    await this.validateJsonFile(options.file);
  }

  private async validateJsonFile(filePath: string): Promise<void> {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      const jsonData: unknown = JSON.parse(fileContent);

      const validate = this.ajv.compile(this.schema);
      const valid = validate(jsonData);

      if (valid) {
        console.log('✅ JSON file is valid');
        console.log(`Validated ${(jsonData as any[]).length} items`);
      } else {
        console.log('❌ JSON file validation failed:');
        console.log(validate.errors);
        process.exit(1);
      }
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
    description:
      'JSON file to validate with schema: { date: string, hash: string, patches: object[] }[]',
    required: true,
  })
  parseFile(val: string) {
    return val;
  }
}
