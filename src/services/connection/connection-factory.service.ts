import { Injectable } from '@nestjs/common';
import { BranchScope, RevisionScope } from '@revisium/client';
import { RevisiumApiClient } from './api-client';
import { LoggerService } from '../common';
import { RevisiumUrlComplete, UrlBuilderService } from '../url';

export interface ConnectionInfo {
  url: RevisiumUrlComplete;
  client: RevisiumApiClient;
  branchScope: BranchScope;
  revisionScope: RevisionScope;
}

export interface ConnectOptions {
  label?: string;
}

@Injectable()
export class ConnectionFactoryService {
  constructor(
    private readonly urlBuilder: UrlBuilderService,
    private readonly logger: LoggerService,
  ) {}

  async createConnection(
    url: RevisiumUrlComplete,
    options: ConnectOptions = {},
  ): Promise<ConnectionInfo> {
    const label = options.label ?? 'API';
    const formattedUrl = this.urlBuilder.formatAsRevisiumUrl(url);

    this.logger.connecting(label, formattedUrl);

    const client = await this.createAuthenticatedClient(url);

    const branchScope = await client.client.branch({
      org: url.organization,
      project: url.project,
      branch: url.branch || 'master',
    });

    const revisionScope = this.resolveRevisionScope(url.revision, branchScope);
    const revisionId = revisionScope.revisionId;
    const revisionLabel = this.formatRevisionLabel(
      url.revision,
      branchScope.headRevisionId,
      branchScope.draftRevisionId,
      revisionId,
    );

    this.logger.connected(
      `Project: ${url.organization}/${url.project}, Branch: ${url.branch || 'master'}, Revision: ${revisionLabel}`,
    );

    return {
      url,
      client,
      branchScope,
      revisionScope,
    };
  }

  private async createAuthenticatedClient(
    url: RevisiumUrlComplete,
  ): Promise<RevisiumApiClient> {
    const client = new RevisiumApiClient(url.baseUrl);
    const username = await client.authenticate(url.auth);

    this.logger.authenticated(username);

    return client;
  }

  private resolveRevisionScope(
    revision: string,
    branchScope: BranchScope,
  ): RevisionScope {
    if (revision === 'draft') {
      return branchScope.draft();
    }
    if (revision === 'head') {
      return branchScope.head();
    }
    return branchScope.draft();
  }

  private formatRevisionLabel(
    revision: string,
    headRevisionId: string,
    draftRevisionId: string,
    resolvedId: string,
  ): string {
    if (revision === 'head') {
      return 'head';
    }
    if (revision === 'draft') {
      return 'draft';
    }

    if (resolvedId === headRevisionId) {
      return `${resolvedId} (head)`;
    }
    if (resolvedId === draftRevisionId) {
      return `${resolvedId} (draft)`;
    }

    return resolvedId;
  }
}
