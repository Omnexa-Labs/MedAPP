import 'server-only';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import type { SessionRecord, SessionStore } from './session-types';
import { HttpError } from './errors';

function key(id: string) {
  return `medapp:admin:{${createHash('sha256').update(id).digest('hex')}}`;
}
function ttl(value: SessionRecord) {
  return Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
}
let client: Redis | undefined;
export function redis() {
  if (client?.status === 'end') client = undefined;
  if (!client) {
    const url = process.env.ADMIN_REDIS_URL;
    if (!url) throw new HttpError(503, 'Sign-in is temporarily unavailable.');
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      retryStrategy: () => null,
    });
    client.on('error', () => {
      /* Commands report an unavailable session store without logging credentials. */
    });
  }
  return client;
}
export const sessionStore: SessionStore = {
  async get(id) {
    const raw = await redis().get(key(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as SessionRecord;
    if (!value.tokens || !value.user?.id || value.expiresAt <= Date.now()) {
      await this.remove(id);
      return null;
    }
    return value;
  },
  async create(id, value) {
    await redis().set(key(id), JSON.stringify(value), 'EX', ttl(value));
  },
  async saveIfPresent(id, value) {
    return Boolean(
      await redis().set(key(id), JSON.stringify(value), 'EX', ttl(value), 'XX'),
    );
  },
  async remove(id) {
    await redis().del(key(id));
  },
  async lock(id, owner) {
    return (
      (await redis().set(key(id) + ':refresh', owner, 'PX', 15000, 'NX')) ===
      'OK'
    );
  },
  async unlock(id, owner) {
    await redis().eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key(id) + ':refresh',
      owner,
    );
  },
};
