import bcrypt from 'bcryptjs';

// Password hashing helpers keep plaintext passwords out of database reads and audit events.
// Balances password hash resistance with the CPU cost of each login and registration.
const workFactor = 12;

/** Converts a submitted password to a one-way hash before it is written to the user table. */
export function hashPassword(password: string) {
  return bcrypt.hash(password, workFactor);
}

/** Compares a submitted password with its stored hash without exposing the original value. */
export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
