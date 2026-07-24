/**
 * Telegram Mini App initData verification.
 * Implements the official HMAC scheme:
 *   secret_key   = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   expected_hash= HMAC_SHA256(key=secret_key,   message=data_check_string)
 */

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
}

async function hmacSha256(keyBytes: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies the signed initData string. Returns the parsed user on success,
 * or null when the signature is invalid or the payload is stale/malformed.
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86_400,
): Promise<VerifiedInitData | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return null;
  }

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      pairs.push(`${key}=${value}`);
    }
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));
  if (expected !== hash) {
    return null;
  }

  const authDate = Number(params.get('auth_date') ?? '0');
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    return null;
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    if (!user?.id) {
      return null;
    }
    return { user, authDate };
  } catch {
    return null;
  }
}
