import 'server-only';
import { createHash } from 'node:crypto';
import { redis } from './store';
export interface SigninAttempt {
  stage: 'google' | 'mfa';
  deviceId: string;
  challenge: string;
  scope: string;
  expiresAt: number;
}
const key = (id: string) =>
  `medapp:admin:signin:{${createHash('sha256').update(id).digest('hex')}}`;
export const attempts = {
  async get(id: string): Promise<SigninAttempt | null> {
    const raw = await redis().get(key(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as SigninAttempt;
    return value.expiresAt > Date.now() ? value : null;
  },
  async put(id: string, value: SigninAttempt) {
    await redis().set(
      key(id),
      JSON.stringify(value),
      'EX',
      Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000)),
    );
  },
  async remove(id: string) {
    await redis().del(key(id));
  },
  async lock(id: string, owner: string) {
    return (
      (await redis().set(key(id) + ':lock', owner, 'PX', 60000, 'NX')) === 'OK'
    );
  },
  async unlock(id: string, owner: string) {
    await redis().eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      key(id) + ':lock',
      owner,
    );
  },
};
