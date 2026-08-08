import type { ScanResult, Scanner } from '@/shared-types.js';

const EICAR_TEST_STRING = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Deterministic dev/test default (ARCHITECTURE §4.5, D-14) — no ClamAV
 * container required. Flags the standard EICAR antivirus test string as
 * `INFECTED` so `CM-07`'s "publish blocked unless CLEAN" path is exercisable
 * without a real scanner; everything else scans `CLEAN`.
 */
export class FakeScanner implements Scanner {
  scan(data: Buffer): Promise<ScanResult> {
    const isTestVirus = data.toString('utf8').includes(EICAR_TEST_STRING);
    return Promise.resolve({ status: isTestVirus ? 'INFECTED' : 'CLEAN' });
  }
}
