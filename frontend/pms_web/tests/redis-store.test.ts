import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import type { SessionRecord } from "../src/server/session-types";
import { identity, tokens, deviceId } from "./session-fixture";
vi.mock("server-only", () => ({}));
import { key, redis, sessionStore } from "../src/server/store";
const run = promisify(execFile);
const name = "medapp-pms-web-qa-" + randomBytes(6).toString("hex");
let started = false,
  connected = false;
describe.skipIf(process.env.PMS_WEB_TEST_REDIS !== "1")(
  "real Redis session persistence",
  () => {
    beforeAll(async () => {
      await run(
        "docker",
        [
          "run",
          "--detach",
          "--rm",
          "--name",
          name,
          "--publish",
          "127.0.0.1::6379",
          "redis:7-alpine",
        ],
        { windowsHide: true, timeout: 60000 },
      );
      started = true;
      const { stdout } = await run("docker", ["port", name, "6379/tcp"], {
        windowsHide: true,
        timeout: 10000,
      });
      const address = stdout.trim();
      expect(address).toMatch(/^127\.0\.0\.1:\d+$/);
      process.env.PMS_WEB_REDIS_URL = "redis://" + address;
      await redis().ping();
      connected = true;
    }, 90000);
    afterAll(async () => {
      if (connected) redis().disconnect();
      if (started)
        await run("docker", ["rm", "--force", name], {
          windowsHide: true,
          timeout: 30000,
        });
    });
    async function record() {
      const id = randomBytes(32).toString("hex");
      const session: SessionRecord = {
        scope: identity.scope,
        revision: 0,
        expiresAt: Date.now() + 8 * 3600000,
        platform: {
          tokens,
          deviceId,
          accountId: "11111111-1111-4111-8111-111111111111",
          accessExpiresAt: Date.now() + 900000,
        },
        credential: {
          token: "pharmacy-secret-access",
          expiresAt: Date.now() + 300000,
        },
        user: identity.user,
        pharmacy: identity.pharmacy,
      };
      await sessionStore.create(id, session);
      return { id, session };
    }
    it("stores an opaque hashed cookie key with an eight-hour lifetime", async () => {
      const { id, session } = await record();
      expect(key(id)).not.toContain(id);
      expect(session.platform?.tokens).toEqual(tokens);
      expect(await redis().ttl(key(id))).toBeGreaterThan(28700);
      expect(await redis().ttl(key(id))).toBeLessThanOrEqual(28800);
    });
    it("requires current lock ownership and revision to commit changes", async () => {
      const { id, session } = await record(),
        owner = "first";
      expect(await sessionStore.lock(id, owner)).toBe(true);
      expect(await sessionStore.lock(id, "second")).toBe(false);
      expect(
        await sessionStore.commit(id, "other", 0, { ...session, revision: 1 }),
      ).toBe(false);
      expect(
        await sessionStore.commit(id, owner, 0, { ...session, revision: 1 }),
      ).toBe(true);
      expect(
        await sessionStore.commit(id, owner, 0, { ...session, revision: 2 }),
      ).toBe(false);
      await sessionStore.unlock(id, "other");
      expect(await sessionStore.lock(id, "second")).toBe(false);
      await sessionStore.unlock(id, owner);
      expect(await sessionStore.lock(id, "second")).toBe(true);
    });
    it("cannot restore a signed-out session with a late save", async () => {
      const { id, session } = await record();
      await sessionStore.lock(id, "owner");
      await sessionStore.remove(id);
      expect(
        await sessionStore.commit(id, "owner", 0, { ...session, revision: 1 }),
      ).toBe(false);
      expect(await sessionStore.get(id)).toBeNull();
    });
    it("atomically rejects stale sign-out after a scope change", async () => {
      const { id, session } = await record();
      await sessionStore.lock(id, "owner");
      const changed = { ...session, scope: "changed", revision: 1 };
      expect(await sessionStore.commit(id, "owner", 0, changed)).toBe(true);
      expect(await sessionStore.remove(id, session.scope)).toBe(false);
      expect(await sessionStore.get(id)).toEqual(changed);
      expect(await sessionStore.remove(id, "changed")).toBe(true);
    });
  },
);
