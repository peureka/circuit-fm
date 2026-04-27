const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/u/save");
const { createFakeRes } = require("./helpers/fakeRes");

function fakeCircuit({ result = { ok: true }, fail = null } = {}) {
  const calls = [];
  return {
    async saveProfile(args) {
      calls.push(args);
      if (fail) throw new Error(fail);
      return result;
    },
    async getProfile() {
      return null;
    },
    async upsertAudience() {
      return null;
    },
    _calls: calls,
  };
}

const TOKEN = "valid-token-aaaaaaaaaaaaaaaa";

function postBody(body) {
  return { method: "POST", body };
}

test("non-POST returns 405", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", body: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "POST");
});

test("missing token returns 400 plain-text", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler(postBody({ consent: "on" }), res);
  assert.equal(res.statusCode, 400);
});

test("missing consent redirects with CONSENT_REQUIRED", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler(postBody({ token: TOKEN }), res);
  assert.equal(res.statusCode, 303);
  assert.match(res.headers.Location, /\?error=CONSENT_REQUIRED$/);
});

test("happy path redirects to ?saved=1", async () => {
  const circuit = fakeCircuit();
  const handler = createHandler({ circuit });
  const res = createFakeRes();
  await handler(
    postBody({
      token: TOKEN,
      consent: "on",
      instagramHandle: "alex",
      neighbourhoods: ["shoreditch"],
      availableNights: ["thu", "fri"],
      formatPreferences: ["show"],
    }),
    res,
  );
  assert.equal(res.statusCode, 303);
  assert.match(
    res.headers.Location,
    new RegExp(`/u/${TOKEN}\\?saved=1$`),
  );
  assert.equal(circuit._calls.length, 1);
  assert.deepEqual(circuit._calls[0], {
    token: TOKEN,
    instagramHandle: "alex",
    neighbourhoods: ["shoreditch"],
    availableNights: ["thu", "fri"],
    formatPreferences: ["show"],
    consent: true,
  });
});

test("strips a leading @ from instagramHandle before sending", async () => {
  const circuit = fakeCircuit();
  const handler = createHandler({ circuit });
  const res = createFakeRes();
  await handler(
    postBody({
      token: TOKEN,
      consent: "on",
      instagramHandle: "@alex",
    }),
    res,
  );
  assert.equal(circuit._calls[0].instagramHandle, "alex");
});

test("empty instagramHandle becomes null", async () => {
  const circuit = fakeCircuit();
  const handler = createHandler({ circuit });
  const res = createFakeRes();
  await handler(
    postBody({
      token: TOKEN,
      consent: "on",
      instagramHandle: "",
    }),
    res,
  );
  assert.equal(circuit._calls[0].instagramHandle, null);
});

test("filters out unknown neighbourhood/night/format values", async () => {
  const circuit = fakeCircuit();
  const handler = createHandler({ circuit });
  const res = createFakeRes();
  await handler(
    postBody({
      token: TOKEN,
      consent: "on",
      neighbourhoods: ["shoreditch", "mars-colony"],
      availableNights: ["thu", "blursday"],
      formatPreferences: ["show", "rave"],
    }),
    res,
  );
  assert.deepEqual(circuit._calls[0].neighbourhoods, ["shoreditch"]);
  assert.deepEqual(circuit._calls[0].availableNights, ["thu"]);
  assert.deepEqual(circuit._calls[0].formatPreferences, ["show"]);
});

test("Circuit returning ok:false maps to error redirect", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({ result: { ok: false, code: "INVALID_TOKEN" } }),
  });
  const res = createFakeRes();
  await handler(postBody({ token: TOKEN, consent: "on" }), res);
  assert.equal(res.statusCode, 303);
  assert.match(res.headers.Location, /\?error=INVALID_TOKEN$/);
});

test("Circuit thrown error redirects with CIRCUIT_UNREACHABLE", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({ fail: "network blip" }),
  });
  const res = createFakeRes();
  await handler(postBody({ token: TOKEN, consent: "on" }), res);
  assert.equal(res.statusCode, 303);
  assert.match(res.headers.Location, /\?error=CIRCUIT_UNREACHABLE$/);
});

test("Circuit thrown 'INVALID_TOKEN' message maps to that error code", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({
      fail: "circuit /api/organiser/v1/audience/profile failed [INVALID_TOKEN]: bad token",
    }),
  });
  const res = createFakeRes();
  await handler(postBody({ token: TOKEN, consent: "on" }), res);
  assert.match(res.headers.Location, /\?error=INVALID_TOKEN$/);
});

test("no circuit client → CIRCUIT_UNREACHABLE redirect", async () => {
  const handler = createHandler({ circuit: null });
  const res = createFakeRes();
  await handler(postBody({ token: TOKEN, consent: "on" }), res);
  assert.equal(res.statusCode, 303);
  assert.match(res.headers.Location, /\?error=CIRCUIT_UNREACHABLE$/);
});

test("Instagram handle with whitespace or angle brackets returns BAD_INPUT", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler(
    postBody({
      token: TOKEN,
      consent: "on",
      instagramHandle: "alex<script>",
    }),
    res,
  );
  assert.match(res.headers.Location, /\?error=BAD_INPUT$/);
});
