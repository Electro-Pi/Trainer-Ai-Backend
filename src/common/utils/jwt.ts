import { SignJWT, importPKCS8, importSPKI, jwtVerify, type CryptoKey } from 'jose';

import { UnauthorizedError } from '@/common/exceptions/app-error.js';
import { JWT_ACCESS_TOKEN_ALGORITHM } from '@/config/constants.js';
import { env } from '@/config/env.js';
import type { JwtAccessClaims } from '@/shared-types.js';

// Pure RS256 access-JWT sign/verify — no repository dependency, so
// `common/guards/authenticate.guard.ts` can import it directly without
// pulling in refresh-token persistence (that stays in
// `modules/auth/services/token.service.ts`, which depends on the `users`
// module's repository and would otherwise create a guard → modules → guard
// import cycle).

let cachedPrivateKey: CryptoKey | undefined;
let cachedPublicKey: CryptoKey | undefined;

// `.env.example` documents both keys as base64-encoded PEM (keeps a
// multi-line PEM block on one env-var line) — decode before handing to jose.
function decodeBase64Pem(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

async function getPrivateKey(): Promise<CryptoKey> {
  cachedPrivateKey ??= await importPKCS8(
    decodeBase64Pem(env.JWT_PRIVATE_KEY),
    JWT_ACCESS_TOKEN_ALGORITHM,
  );
  return cachedPrivateKey;
}

async function getPublicKey(): Promise<CryptoKey> {
  cachedPublicKey ??= await importSPKI(
    decodeBase64Pem(env.JWT_PUBLIC_KEY),
    JWT_ACCESS_TOKEN_ALGORITHM,
  );
  return cachedPublicKey;
}

export async function signAccessToken(claims: JwtAccessClaims): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ orgId: claims.orgId, role: claims.role, locale: claims.locale })
    .setProtectedHeader({ alg: JWT_ACCESS_TOKEN_ALGORITHM })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<JwtAccessClaims> {
  const key = await getPublicKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [JWT_ACCESS_TOKEN_ALGORITHM] });
    return {
      sub: payload.sub as string,
      orgId: payload['orgId'] as string,
      role: payload['role'] as string,
      locale: payload['locale'] as string,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}
