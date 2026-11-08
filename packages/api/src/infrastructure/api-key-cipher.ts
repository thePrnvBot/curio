import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Encrypts per-user model API keys before they touch Postgres. Values are
 * versioned so plaintext rows written before this change still decrypt
 * (i.e. are read as-is) and can be re-encrypted on the next save.
 *
 * AES-256-GCM with a random 96-bit IV per value; the auth tag is stored
 * alongside the ciphertext. The key is derived with scrypt from the explicit
 * `MODEL_SETTINGS_ENCRYPTION_KEY` when configured, otherwise from the app's
 * auth secret so a fresh deployment is protected by default.
 */
export interface ApiKeyCipher {
  readonly decrypt: (storedValue: string) => string | null;
  readonly encrypt: (plainText: string) => string;
}

const CIPHER_VERSION = "v1";
const ENCRYPTED_PREFIX = "enc";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_SALT = "curio:user-model-settings:v1";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

export function createApiKeyCipher(secret: string): ApiKeyCipher {
  if (secret.length < 32) {
    throw new Error(
      "The model-settings encryption secret must be at least 32 characters"
    );
  }
  const key = deriveKey(secret);

  return {
    decrypt: (storedValue) => {
      if (!storedValue.startsWith(`${ENCRYPTED_PREFIX}:`)) {
        // Legacy plaintext row; still readable, re-encrypted on next save.
        return storedValue;
      }
      const [prefix, version, ivPart, tagPart, cipherPart] =
        storedValue.split(":");
      if (
        prefix !== ENCRYPTED_PREFIX ||
        version !== CIPHER_VERSION ||
        ivPart === undefined ||
        tagPart === undefined ||
        cipherPart === undefined
      ) {
        return null;
      }
      try {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(ivPart, "base64url")
        );
        decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
        const plainText = Buffer.concat([
          decipher.update(Buffer.from(cipherPart, "base64url")),
          decipher.final(),
        ]);
        return plainText.toString("utf-8");
      } catch {
        // A rotated/corrupt key must degrade to "no saved key" rather than
        // break the settings page or hand the model garbage credentials.
        return null;
      }
    },
    encrypt: (plainText) => {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const cipherText = Buffer.concat([
        cipher.update(plainText, "utf-8"),
        cipher.final(),
      ]);
      return [
        ENCRYPTED_PREFIX,
        CIPHER_VERSION,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        cipherText.toString("base64url"),
      ].join(":");
    },
  };
}
