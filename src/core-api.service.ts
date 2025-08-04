import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Api, RequestParams } from 'src/__generated__/api';

@Injectable()
export class CoreApiService extends Api<unknown> {
  public token: string | undefined = undefined;

  constructor() {
    super({
      baseUrl: 'http://localhost:8080',
    });
  }

  public async login() {
    const response = await this.api.login({
      emailOrUsername: 'admin',
      password: 'admin',
    });

    if (response.error) {
      throw new InternalServerErrorException(response.error);
    }

    this.token = response.data.accessToken;
  }

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    const params = super.mergeRequestParams(params1, params2);
    if (!params.headers) {
      params.headers = {};
    }
    (params.headers as Record<string, string>)['Authorization'] =
      `Bearer ${this.token}`;
    return params;
  }
}
