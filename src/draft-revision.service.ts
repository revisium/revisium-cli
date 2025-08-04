import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoreApiService } from 'src/core-api.service';

@Injectable()
export class DraftRevisionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly coreApiService: CoreApiService,
  ) {}

  public async getDraftRevisionId() {
    const result = await this.api.draftRevision(
      this.configService.get('REVISIUM_ORGANIZATION', ''),
      this.configService.get('REVISIUM_PROJECT', ''),
      this.configService.get('REVISIUM_BRANCH', ''),
    );

    if (result.error) {
      console.error(result.error);
      throw new Error(result.error);
    }

    return result.data.id;
  }

  private get api() {
    return this.coreApiService.api;
  }
}
