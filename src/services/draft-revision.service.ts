import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreApiService } from 'src/services/core-api.service';

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
    const result = await this.api.draftRevision(
      options?.organization ??
        this.configService.get('REVISIUM_ORGANIZATION', ''),
      options?.project ?? this.configService.get('REVISIUM_PROJECT', ''),
      options?.branch ?? this.configService.get('REVISIUM_BRANCH', ''),
    );

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
