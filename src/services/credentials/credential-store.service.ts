import { Injectable } from '@nestjs/common';
import { Entry } from '@napi-rs/keyring';
import { AuthCredentials } from 'src/services/url';

const SERVICE_NAME = 'revisium-cli';

export interface CredentialRef {
  baseUrl: string;
  credential: string;
}

interface StoredApiKeyCredential {
  method: 'apikey';
  apiKey: string;
}

type StoredCredential = StoredApiKeyCredential;

@Injectable()
export class CredentialStoreService {
  private readonly serviceName =
    process.env.REVISIUM_CREDENTIAL_STORE_SERVICE || SERVICE_NAME;

  saveApiKey(ref: CredentialRef, apiKey: string): void {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      throw new Error('API key cannot be empty');
    }

    this.writeCredential(ref, {
      method: 'apikey',
      apiKey: trimmedApiKey,
    });
  }

  getCredential(ref: CredentialRef): AuthCredentials | undefined {
    const raw = this.readCredential(ref);
    if (!raw) {
      return undefined;
    }

    const stored = this.parseStoredCredential(raw, ref);
    return { method: 'apikey', apikey: stored.apiKey };
  }

  hasCredential(ref: CredentialRef): boolean {
    return this.readCredential(ref) !== undefined;
  }

  deleteCredential(ref: CredentialRef): boolean {
    try {
      return this.createEntry(ref).deleteCredential();
    } catch (error) {
      if (this.isMissingCredentialError(error)) {
        return false;
      }
      throw this.wrapStoreError('delete', ref, error);
    }
  }

  getAccountName(ref: CredentialRef): string {
    return `instance:${ref.baseUrl}|credential:${ref.credential}`;
  }

  private writeCredential(ref: CredentialRef, credential: StoredCredential) {
    try {
      this.createEntry(ref).setPassword(JSON.stringify(credential));
    } catch (error) {
      throw this.wrapStoreError('save', ref, error);
    }
  }

  private readCredential(ref: CredentialRef): string | undefined {
    try {
      return this.createEntry(ref).getPassword() ?? undefined;
    } catch (error) {
      if (this.isMissingCredentialError(error)) {
        return undefined;
      }
      throw this.wrapStoreError('read', ref, error);
    }
  }

  private createEntry(ref: CredentialRef): Entry {
    return new Entry(this.serviceName, this.getAccountName(ref));
  }

  private parseStoredCredential(
    raw: string,
    ref: CredentialRef,
  ): StoredCredential {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `Saved Revisium credential "${ref.credential}" for ${ref.baseUrl} is invalid. Run: revisium auth login --url revisium://${ref.baseUrl.replace(/^https?:\/\//, '')} --credential ${ref.credential} --api-key`,
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('method' in parsed) ||
      parsed.method !== 'apikey' ||
      !('apiKey' in parsed) ||
      typeof parsed.apiKey !== 'string' ||
      parsed.apiKey.trim() === ''
    ) {
      throw new Error(
        `Saved Revisium credential "${ref.credential}" for ${ref.baseUrl} has an unsupported format. Run: revisium auth login --url revisium://${ref.baseUrl.replace(/^https?:\/\//, '')} --credential ${ref.credential} --api-key`,
      );
    }

    return {
      method: 'apikey',
      apiKey: parsed.apiKey.trim(),
    };
  }

  private isMissingCredentialError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('NoEntry') ||
        error.message.includes('not found') ||
        error.message.includes('No matching entry'))
    );
  }

  private wrapStoreError(
    action: 'save' | 'read' | 'delete',
    ref: CredentialRef,
    error: unknown,
  ): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
      `Could not ${action} Revisium credential "${ref.credential}" for ${ref.baseUrl}: ${message}`,
    );
  }
}
