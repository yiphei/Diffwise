/**
 * The ONLY module that touches node:crypto for secrets (§3.6). AES-256-GCM with
 * AAD bound to userId, a fresh 12-byte IV per encryption, a 16-byte auth tag, and
 * a versioned master-key registry for rotation. The envelope maps 1:1 onto the
 * discrete `credentials` columns (ciphertext/iv/auth_tag/key_version) — never a
 * concatenated blob.
 *
 * NEVER logs plaintext, keys, or ciphertext. Plaintext/decrypted buffers stay in
 * local variables and are used immediately. Key validation is LAZY (first use), so
 * `next build` does not require a real master key.
 *
 * One-file KMS upgrade path (§3.6): only getKey/encrypt/decrypt change; callers and
 * the CipherEnvelope shape stay identical (encrypt/decrypt would become async).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

export interface CipherEnvelope {
  ciphertext: Buffer;
  iv: Buffer; // 12 bytes
  authTag: Buffer; // 16 bytes
  keyVersion: number;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

interface MasterKey {
  version: number;
  key: Buffer;
}

let _registry: Map<number, MasterKey> | null = null;
let _activeVersion = 1;

/** Parse a base64 32-byte key from an env var; throws on malformed. */
function parseKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new CryptoError(`${label} must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

/** Load + memoize the master-key registry from ENCRYPTION_MASTER_KEY (+ _V2/_V3...).
 *  The unsuffixed var is the ACTIVE (highest) version. Older suffixed keys decrypt
 *  rows written before a rotation. Fails fast on first use if absent/malformed. */
function loadKeys(): Map<number, MasterKey> {
  if (_registry) return _registry;
  const reg = new Map<number, MasterKey>();

  const active = process.env.ENCRYPTION_MASTER_KEY;
  if (!active) throw new CryptoError("ENCRYPTION_MASTER_KEY is required");

  // Discover versioned older keys: ENCRYPTION_MASTER_KEY_V2, _V3, ...
  const versions: number[] = [];
  for (const name of Object.keys(process.env)) {
    const m = name.match(/^ENCRYPTION_MASTER_KEY_V(\d+)$/);
    if (m) versions.push(Number(m[1]));
  }
  for (const v of versions) {
    reg.set(v, { version: v, key: parseKey(process.env[`ENCRYPTION_MASTER_KEY_V${v}`]!, `ENCRYPTION_MASTER_KEY_V${v}`) });
  }
  // Active version = one above the highest suffixed version (or 1 if none).
  const activeVersion = versions.length ? Math.max(...versions) + 1 : 1;
  reg.set(activeVersion, { version: activeVersion, key: parseKey(active, "ENCRYPTION_MASTER_KEY") });

  _activeVersion = activeVersion;
  _registry = reg;
  return reg;
}

function getKey(version: number): Buffer {
  const k = loadKeys().get(version);
  if (!k) throw new CryptoError(`unknown key_version ${version}`);
  return k.key;
}

export function activeKeyVersion(): number {
  loadKeys();
  return _activeVersion;
}

export function encrypt(plaintext: string, userId: string): CipherEnvelope {
  const version = activeKeyVersion();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(version), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, keyVersion: version };
}

export function decrypt(envelope: CipherEnvelope, userId: string): string {
  const decipher = createDecipheriv(ALGO, getKey(envelope.keyVersion), envelope.iv);
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(envelope.authTag);
  // Throws on tag/AAD mismatch (tampering or wrong user) — never returns garbage.
  return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
}
