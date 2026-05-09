const test = require("node:test");
const assert = require("node:assert/strict");

const { createCircuitClient } = require("../lib/circuit-client");

function fakeFetch(handler) {
  return async function (url, init) {
    return handler(url, init);
  };
}

test("strips surrounding double quotes from baseUrl + token (Vercel env paste hazard)", async () => {
  // The exact failure mode that broke prod: PJ pasted the URL into the
  // Vercel env input wrapped in quotes, so the value was stored as
  // `"https://meetcircuit.com"`. Without the strip, fetch is called with
  // a malformed URL like `"https://meetcircuit.com"/api/...`.
  let receivedUrl = null;
  let receivedAuth = null;
  const client = createCircuitClient({
    baseUrl: '"https://meetcircuit.com"',
    token: '"cirk_org_abc"',
    fetchImpl: fakeFetch(async (url, init) => {
      receivedUrl = url;
      receivedAuth = init.headers.Authorization;
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  });

  await client.lookupCardByChip("CHIP1");

  assert.equal(receivedUrl, "https://meetcircuit.com/api/organiser/v1/cards/by-chip/CHIP1");
  assert.equal(receivedAuth, "Bearer cirk_org_abc");
});

test("strips surrounding single quotes too", async () => {
  let receivedUrl = null;
  const client = createCircuitClient({
    baseUrl: "'https://meetcircuit.com'",
    token: "'cirk_org_abc'",
    fetchImpl: fakeFetch(async (url) => {
      receivedUrl = url;
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  });
  await client.lookupCardByChip("CHIP2");
  assert.equal(receivedUrl, "https://meetcircuit.com/api/organiser/v1/cards/by-chip/CHIP2");
});

test("trims surrounding whitespace from baseUrl + token", async () => {
  let receivedAuth = null;
  const client = createCircuitClient({
    baseUrl: "  https://meetcircuit.com  ",
    token: "  cirk_org_abc  ",
    fetchImpl: fakeFetch(async (_url, init) => {
      receivedAuth = init.headers.Authorization;
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  });
  await client.lookupCardByChip("X");
  assert.equal(receivedAuth, "Bearer cirk_org_abc");
});

test("rejects an empty baseUrl after stripping", () => {
  assert.throws(
    () => createCircuitClient({ baseUrl: '""', token: "cirk_org_abc" }),
    /baseUrl is required/,
  );
});

test("rejects an empty token after stripping", () => {
  assert.throws(
    () =>
      createCircuitClient({
        baseUrl: "https://meetcircuit.com",
        token: '""',
      }),
    /token is required/,
  );
});

test("lookupCardByChip returns null on Circuit NOT_FOUND error", async () => {
  const client = createCircuitClient({
    baseUrl: "https://meetcircuit.com",
    token: "cirk_org_abc",
    fetchImpl: fakeFetch(async () => {
      return new Response(
        JSON.stringify({ data: null, error: "Card not found", code: "NOT_FOUND" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }),
  });
  const result = await client.lookupCardByChip("missing");
  assert.equal(result, null);
});
