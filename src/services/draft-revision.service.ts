import { Injectable } from '@nestjs/common';
import { HttpResponse, RevisionModel } from 'src/__generated__/api';
import { CoreApiService } from 'src/services/core-api.service';
import { ResolveOptionsService } from 'src/services/resolve-options.service';

export const DEFAULT_BRANCH = 'master';

@Injectable()
export class DraftRevisionService {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly resolveOptionsService: ResolveOptionsService,
  ) {}

  public async getDraftRevisionId(
    options: {
      organization?: string;
      project?: string;
      branch?: string;
    } = {},
  ) {
    const { organization, project, branch } =
      this.resolveOptionsService.resolve(options);

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

    console.log(`Got draft revision -> id: "${result.data.id}"`);

    return result.data.id;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
