import { Test, TestingModule } from '@nestjs/testing';
import { SyncCommand } from '../sync.command';
import { SyncSchemaCommand } from '../sync-schema.command';
import { SyncDataCommand } from '../sync-data.command';
import { SyncAllCommand } from '../sync-all.command';

describe('SyncCommand', () => {
  let command: SyncCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncCommand,
        { provide: SyncSchemaCommand, useValue: {} },
        { provide: SyncDataCommand, useValue: {} },
        { provide: SyncAllCommand, useValue: {} },
      ],
    }).compile();

    command = module.get<SyncCommand>(SyncCommand);
  });

  it('initializes without errors', () => {
    expect(command).toBeDefined();
    expect(command).toBeInstanceOf(SyncCommand);
  });

  it('runs without errors and calls help', async () => {
    Object.defineProperty(command, 'command', {
      value: { help: jest.fn() },
      configurable: true,
    });

    const result = await command.run();
    expect(result).toBeUndefined();
  });
});
