import "server-only";
import { key, redis } from "./store";
export interface SigninAttempt {
  deviceId: string;
  challenge: string;
  scope: string;
  expiresAt: number;
}
const attemptKey = (id: string) => key(id) + ":signin";
export const attempts = {
  async get(id: string): Promise<SigninAttempt | null> {
    const raw = await redis().get(attemptKey(id));
    if (!raw) return null;
    const result = JSON.parse(raw) as SigninAttempt;
    return result.expiresAt > Date.now() ? result : null;
  },
  async put(id: string, value: SigninAttempt) {
    await redis().set(
      attemptKey(id),
      JSON.stringify(value),
      "EX",
      Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000)),
    );
  },
  async remove(id: string) {
    await redis().del(attemptKey(id));
  },
  async lock(id: string, owner: string) {
    return (
      (await redis().set(
        attemptKey(id) + ":lock",
        owner,
        "PX",
        60000,
        "NX",
      )) === "OK"
    );
  },
  async unlock(id: string, owner: string) {
    await redis().eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      attemptKey(id) + ":lock",
      owner,
    );
  },
};
