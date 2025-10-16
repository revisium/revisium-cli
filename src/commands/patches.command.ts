import { Command, CommandRunner } from 'nest-commander';
import { ValidatePatchesCommand } from './validate-patches.command';
import { SavePatchesCommand } from './save-patches.command';
import { PreviewPatchesCommand } from './preview-patches.command';
import { ApplyPatchesCommand } from './apply-patches.command';

@Command({
  name: 'patches',
  subCommands: [
    ValidatePatchesCommand,
    SavePatchesCommand,
    PreviewPatchesCommand,
    ApplyPatchesCommand,
  ],
})
export class PatchesCommand extends CommandRunner {
  constructor() {
    super();
  }

  run(): Promise<void> {
    this.command.help();
  }
}
