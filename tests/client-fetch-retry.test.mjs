import test from "node:test";
import assert from "node:assert/strict";

test("network-only completion retry retries the same operation once after a thrown fetch error", async () => {
  let mod = null;
  try {
    mod = await import("../lib/clientFetchRetry.ts");
  } catch {}

  assert.equal(typeof mod?.withSingleNetworkRetry, "function");

  let attempts = 0;
  const values = [];
  const result = await mod.withSingleNetworkRetry(async () => {
    attempts += 1;
    values.push("same-completion");
    if (attempts === 1) throw new TypeError("network");
    return "saved";
  }, 0);

  assert.equal(result, "saved");
  assert.equal(attempts, 2);
  assert.deepEqual(values, ["same-completion", "same-completion"]);
});

test("network-only completion retry does not retry a successful operation", async () => {
  const { withSingleNetworkRetry } = await import("../lib/clientFetchRetry.ts");
  let attempts = 0;
  const result = await withSingleNetworkRetry(async () => {
    attempts += 1;
    return "saved";
  }, 0);

  assert.equal(result, "saved");
  assert.equal(attempts, 1);
});


test("transient member auth retry retries 401 and returns the later authenticated response", async () => {
  let mod = null;
  try {
    mod = await import("../lib/clientFetchRetry.ts");
  } catch {}

  assert.equal(typeof mod?.withTransientAuthRetry, "function");

  let attempts = 0;
  const response = await mod.withTransientAuthRetry(async () => {
    attempts += 1;
    return new Response("{}", { status: attempts === 1 ? 401 : 200 });
  }, [0]);

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
});

test("transient member auth retry does not retry non-auth HTTP errors", async () => {
  const mod = await import("../lib/clientFetchRetry.ts");
  assert.equal(typeof mod?.withTransientAuthRetry, "function");

  let attempts = 0;
  const response = await mod.withTransientAuthRetry(async () => {
    attempts += 1;
    return new Response("{}", { status: 503 });
  }, [0, 0]);

  assert.equal(response.status, 503);
  assert.equal(attempts, 1);
});
