import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpResponse, RevisionModel } from 'src/__generated__/api';
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

    console.log(
      `Request parameters -> organization: "${organization}", project: "${project}", branch: "${branch}"`,
    );

    const result = (await this.api.draftRevision(
      organization,
      project,
      branch,
    )) as HttpResponse<RevisionModel, Error>;

    if (result.error) {
      const errorMessage = `Failed to get draft revision: ${result.error.message}`;
      console.error(errorMessage);
      throw result.error;
    }

    console.log(`Got draft revision -> id: ${result.data.id}`);

    return result.data.id;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
