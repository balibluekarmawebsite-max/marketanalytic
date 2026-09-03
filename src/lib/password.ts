import bcrypt from "bcryptjs";

// Password hashing — bcrypt (pure-JS build, so it needs no native compilation
// on the server). Node runtime only; never import this from middleware.

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
