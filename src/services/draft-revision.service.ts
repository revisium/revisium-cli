import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreApiService } from 'src/services/core-api.service';

export const DEFAULT_BRANCH = 'master';

@Injectable()
export class DraftRevisionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly coreApiService: CoreApiService,
  ) {}

  public async getDraftRevisionId(
    options: {
      organization?: string;
      project?: string;
      branch?: string;
    } = {},
  ) {
    const organization =
      options?.organization ??
      this.configService.get<string>('REVISIUM_ORGANIZATION');

    if (!organization) {
      throw new Error(
        'No organization provided. Use environment variable REVISIUM_ORGANIZATION or --organization option.',
      );
    }

    const project =
      options?.project ?? this.configService.get<string>('REVISIUM_PROJECT');

    if (!project) {
      throw new Error(
        'No project provided. Use environment variable REVISIUM_PROJECT or --project option.',
      );
    }

    const branch =
      options?.branch ??
      this.configService.get<string>('REVISIUM_BRANCH', DEFAULT_BRANCH);

    const result = await this.api.draftRevision(organization, project, branch);

    if (result.error) {
      console.error(result.error);
      throw new Error(result.error as string);
    }

    return result.data.id;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
