import * as argon2 from 'argon2';

// D-17: argon2id over bcrypt — memory-hardness defeats GPU cracking, and
// bcrypt silently truncates past 72 bytes (a real hazard for Arabic
// passphrases, 2 bytes/char in UTF-8). Lives in `common/utils/` (not the
// `auth` module) because it's pure crypto with no repository dependency,
// and the `users` module needs it too (setting a password-fallback user's
// credential) without a cross-module service import.
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}
