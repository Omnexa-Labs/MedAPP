import "server-only";
import { createHash } from "node:crypto";
import Redis from "ioredis";
import { HttpError } from "./errors";
import type { SessionRecord, SessionStore } from "./session-types";
export const key = (id: string) =>
  `medapp:hms:web:{${createHash("sha256").update(id).digest("hex")}}`;
let client: Redis | undefined;
export function redis() {
  if (client?.status === "end") client = undefined;
  if (!client) {
    if (!process.env.HMS_WEB_REDIS_URL)
      throw new HttpError(503, "Sign-in is temporarily unavailable.");
    client = new Redis(process.env.HMS_WEB_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      retryStrategy: () => null,
    });
    client.on("error", () => {
      /* Report command failures without logging credentials. */
    });
  }
  return client;
}
const ttl = (value: SessionRecord) =>
  Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
export const sessionStore: SessionStore = {
  async get(id) {
    const raw = await redis().get(key(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as SessionRecord;
    if (value.expiresAt <= Date.now()) {
      await this.remove(id);
      return null;
    }
    return value;
  },
  async create(id, value) {
    if (
      (await redis().set(
        key(id),
        JSON.stringify(value),
        "EX",
        ttl(value),
        "NX",
      )) !== "OK"
    )
      throw new HttpError(503, "Sign-in could not be saved.");
  },
  async commit(id, owner, revision, value) {
    return Boolean(
      await redis().eval(
        `local old = redis.call('get', KEYS[1])
       if not old or redis.call('get', KEYS[2]) ~= ARGV[1] then return 0 end
       if cjson.decode(old).revision ~= tonumber(ARGV[2]) then return 0 end
       redis.call('set', KEYS[1], ARGV[3], 'EX', ARGV[4]); return 1`,
        2,
        key(id),
        key(id) + ":lock",
        owner,
        revision,
        JSON.stringify(value),
        ttl(value),
      ),
    );
  },
  async remove(id, scope) {
    if (scope === undefined) {
      await redis().del(key(id));
      return true;
    }
    return Boolean(
      await redis().eval(
        `local value = redis.call('get', KEYS[1]); if not value then return 1 end
       if cjson.decode(value).scope ~= ARGV[1] then return 0 end
       redis.call('del', KEYS[1]); return 1`,
        1,
        key(id),
        scope,
      ),
    );
  },
  async lock(id, owner) {
    return (
      (await redis().set(key(id) + ":lock", owner, "PX", 60000, "NX")) === "OK"
    );
  },
  async unlock(id, owner) {
    await redis().eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key(id) + ":lock",
      owner,
    );
  },
};
