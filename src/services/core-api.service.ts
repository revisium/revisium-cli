import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, RequestParams } from 'src/__generated__/api';
import { BaseOptions } from 'src/commands/base.command';

@Injectable()
export class CoreApiService extends Api<unknown> {
  public token: string | undefined = undefined;

  constructor(private readonly configService: ConfigService) {
    super({
      baseUrl: configService.get('REVISIUM_API_URL'),
    });
  }

  public async tryToLogin(options?: BaseOptions) {
    if (options?.url) {
      this.baseUrl = options.url;
    }

    if (!this.baseUrl) {
      throw new Error(
        'No base URL provided. Use environment variable REVISIUM_API_URL or --url option.',
      );
    }

    const username =
      options?.username ?? this.configService.get('REVISIUM_USERNAME');

    const password =
      options?.password ?? this.configService.get('REVISIUM_PASSWORD');

    if (username && password) {
      const response = await this.api.login({
        emailOrUsername: username,
        password: password,
      });

      if (response.error) {
        throw new InternalServerErrorException(response.error);
      }

      this.token = response.data.accessToken;
    } else {
      console.log('Skipping login: username or password is missing.');
    }
  }

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    const params = super.mergeRequestParams(params1, params2);

    if (!params.headers) {
      params.headers = {};
    }

    if (this.token) {
      (params.headers as Record<string, string>)['Authorization'] =
        `Bearer ${this.token}`;
    }

    return params;
  }
}
