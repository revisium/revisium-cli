import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_BRANCH = 'master';

@Injectable()
export class ResolveOptionsService {
  constructor(private readonly configService: ConfigService) {}

  public resolve(
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

    return {
      organization,
      project,
      branch,
    };
  }
}
