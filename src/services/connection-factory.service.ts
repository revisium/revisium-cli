import { Injectable } from '@nestjs/common';
import { RevisiumApiClient } from './api-client';
import { RevisiumUrlComplete, UrlBuilderService } from './url-builder.service';

export interface ConnectionInfo {
  url: RevisiumUrlComplete;
  client: RevisiumApiClient;
  revisionId: string;
  headRevisionId: string;
  draftRevisionId: string;
}

export interface ConnectOptions {
  label?: string;
}

@Injectable()
export class ConnectionFactoryService {
  constructor(private readonly urlBuilder: UrlBuilderService) {}

  async createConnection(
    url: RevisiumUrlComplete,
    options: ConnectOptions = {},
  ): Promise<ConnectionInfo> {
    const label = options.label ?? 'API';
    const formattedUrl = this.urlBuilder.formatAsRevisiumUrl(url);

    console.log(`\nConnecting to ${label}: ${formattedUrl}`);

    const client = await this.createAuthenticatedClient(url);
    await this.validateProject(client, url);
    const revisions = await this.fetchRevisions(client, url);

    const revisionId = this.resolveRevisionId(url.revision, revisions);
    const revisionLabel = this.formatRevisionLabel(url.revision, revisions);

    console.log(
      `  \u2713 Project: ${url.organization}/${url.project}, Branch: ${url.branch || 'master'}, Revision: ${revisionLabel}`,
    );

    return {
      url,
      client,
      revisionId,
      headRevisionId: revisions.headRevisionId,
      draftRevisionId: revisions.draftRevisionId,
    };
  }

  private async createAuthenticatedClient(
    url: RevisiumUrlComplete,
  ): Promise<RevisiumApiClient> {
    const client = new RevisiumApiClient(url.baseUrl);
    const username = await client.authenticate(url.auth);

    console.log(`  \u2713 Authenticated as ${username}`);

    return client;
  }

  private async validateProject(
    client: RevisiumApiClient,
    url: RevisiumUrlComplete,
  ): Promise<void> {
    const response = await client.api.project(url.organization, url.project);

    if (response.error) {
      throw new Error(
        `Failed to get project: ${JSON.stringify(response.error)}`,
      );
    }
  }

  private async fetchRevisions(
    client: RevisiumApiClient,
    url: RevisiumUrlComplete,
  ): Promise<{ headRevisionId: string; draftRevisionId: string }> {
    const branchName = url.branch || 'master';

    const [headResponse, draftResponse] = await Promise.all([
      client.api.headRevision(url.organization, url.project, branchName),
      client.api.draftRevision(url.organization, url.project, branchName),
    ]);

    if (headResponse.error) {
      throw new Error(
        `Failed to get head revision: ${JSON.stringify(headResponse.error)}`,
      );
    }

    if (draftResponse.error) {
      throw new Error(
        `Failed to get draft revision: ${JSON.stringify(draftResponse.error)}`,
      );
    }

    return {
      headRevisionId: headResponse.data.id,
      draftRevisionId: draftResponse.data.id,
    };
  }

  private resolveRevisionId(
    revision: string,
    revisions: { headRevisionId: string; draftRevisionId: string },
  ): string {
    if (revision === 'head') {
      return revisions.headRevisionId;
    }
    if (revision === 'draft') {
      return revisions.draftRevisionId;
    }
    return revision;
  }

  private formatRevisionLabel(
    revision: string,
    revisions: { headRevisionId: string; draftRevisionId: string },
  ): string {
    if (revision === 'head') {
      return 'head';
    }
    if (revision === 'draft') {
      return 'draft';
    }

    const resolvedId = this.resolveRevisionId(revision, revisions);

    if (resolvedId === revisions.headRevisionId) {
      return `${resolvedId} (head)`;
    }
    if (resolvedId === revisions.draftRevisionId) {
      return `${resolvedId} (draft)`;
    }

    return resolvedId;
  }
}
