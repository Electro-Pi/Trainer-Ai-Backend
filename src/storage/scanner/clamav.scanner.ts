import { Readable } from 'node:stream';

import NodeClam from 'clamscan';

import { env } from '@/config/env.js';
import type { ScanResult, Scanner } from '@/shared-types.js';

/**
 * Real implementation (ARCHITECTURE §4.5, CM-07) — talks to the `clamav`
 * docker-compose service over TCP (clamd protocol), never a local binary.
 * The client is only ever constructed when `SCANNER_PROVIDER=clamav`, same
 * lazy-behind-the-provider-check discipline as `MsalService`
 * (MEMORY Technical Discoveries — never eagerly construct a real SDK client).
 */
export class ClamAvScanner implements Scanner {
  private clientPromise: Promise<NodeClam> | undefined;

  private getClient(): Promise<NodeClam> {
    this.clientPromise ??= new NodeClam().init({
      clamdscan: {
        host: env.CLAMAV_HOST,
        port: env.CLAMAV_PORT,
        timeout: 60_000,
        localFallback: false,
      },
      preference: 'clamdscan',
    });
    return this.clientPromise;
  }

  async scan(data: Buffer): Promise<ScanResult> {
    try {
      const client = await this.getClient();
      const { isInfected, viruses } = await client.scanStream(Readable.from(data));
      if (isInfected === null) {
        return { status: 'FAILED' };
      }
      return isInfected ? { status: 'INFECTED', signature: viruses[0] } : { status: 'CLEAN' };
    } catch {
      return { status: 'FAILED' };
    }
  }
}
