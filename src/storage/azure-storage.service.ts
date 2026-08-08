import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { StorageService } from '@/shared-types.js';

function parseConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
} {
  const parts = Object.fromEntries(
    connectionString
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const eqIndex = pair.indexOf('=');
        return [pair.slice(0, eqIndex), pair.slice(eqIndex + 1)];
      }),
  );
  const accountName = parts['AccountName'];
  const accountKey = parts['AccountKey'];
  if (!accountName || !accountKey) {
    throw new ExternalServiceError(
      'AZURE_STORAGE_CONNECTION_STRING missing AccountName/AccountKey',
    );
  }
  return { accountName, accountKey };
}

/** Real implementation (ARCHITECTURE §4.5) — never constructed unless `STORAGE_PROVIDER=azure` (P2's `MsalService` lesson, MEMORY Technical Discoveries). */
export class AzureStorageService implements StorageService {
  private readonly client = BlobServiceClient.fromConnectionString(
    env.AZURE_STORAGE_CONNECTION_STRING,
  );
  private readonly containerName = env.AZURE_STORAGE_CONTAINER;
  private readonly credential = (() => {
    const { accountName, accountKey } = parseConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
    return new StorageSharedKeyCredential(accountName, accountKey);
  })();

  async upload(blobKey: string, data: Buffer, contentType: string): Promise<void> {
    const containerClient = this.client.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobKey);
    await blockBlobClient.upload(data, data.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async getDownloadUrl(blobKey: string, expiresInSeconds = 3600): Promise<string> {
    const containerClient = this.client.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(blobKey);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: blobKey,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(Date.now() + expiresInSeconds * 1000),
      },
      this.credential,
    ).toString();

    return `${blobClient.url}?${sas}`;
  }

  async delete(blobKey: string): Promise<void> {
    const containerClient = this.client.getContainerClient(this.containerName);
    await containerClient.getBlockBlobClient(blobKey).deleteIfExists();
  }
}
