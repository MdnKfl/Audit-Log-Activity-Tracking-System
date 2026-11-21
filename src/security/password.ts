import bcrypt from 'bcryptjs';

// Password hashing helpers keep plaintext passwords out of database reads and audit events.
const workFactor = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, workFactor);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
