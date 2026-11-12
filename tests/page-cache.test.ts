import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cachedPage,
  clearPageCache,
  uncachedAction,
} from "../app/lib/page-cache.ts";

test("화면 캐시는 만료·저장·실패 후 갱신하고 이전 요청이 새 캐시를 덮지 않는다", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  clearPageCache();
  let calls = 0;
  const request = new Request("http://localhost/ledger?month=2026-11");
  const load = async () => ++calls;
  assert.equal(await cachedPage(request, load), 1);
  assert.equal(
    await cachedPage(new Request(request.url + "&edit=one"), load),
    1,
  );
  now = 15001;
  assert.equal(await cachedPage(request, load), 2);
  await uncachedAction(async () => "saved");
  assert.equal(await cachedPage(request, load), 3);
  await assert.rejects(
    uncachedAction(async () => {
      throw new Error("failed");
    }),
  );
  assert.equal(await cachedPage(request, load), 4);
  clearPageCache();
  let finish!: (value: number) => void;
  const old = cachedPage(
    request,
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  clearPageCache();
  assert.equal(await cachedPage(request, load), 5);
  finish(99);
  await old;
  assert.equal(await cachedPage(request, load), 5);
  clearPageCache();
  await assert.rejects(
    cachedPage(request, async () => {
      throw new Error("read failed");
    }),
  );
  assert.equal(await cachedPage(request, load), 6);
  clearPageCache();
});
