const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/u/[token]");
const { createFakeRes } = require("./helpers/fakeRes");

function fakeCircuit({ profile = null, mode = "ok" } = {}) {
  return {
    async getProfile(token) {
      if (mode === "fail") throw new Error("circuit unreachable");
      if (mode === "404") return null;
      return profile;
    },
    async saveProfile() {
      return { ok: true };
    },
    async upsertAudience() {
      return null;
    },
  };
}

const TOKEN = "valid-token-aaaaaaaaaaaaaaaa";

test("GET with no token returns 400 page", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test("GET with non-string token returns 400 page", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: ["x"] } }, res);
  assert.equal(res.statusCode, 400);
});

test("DELETE returns 405 with Allow: GET, HEAD", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "DELETE", query: { token: TOKEN } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "GET, HEAD");
});

test("HEAD with valid token returns 200 with no body and skips Circuit fetch", async () => {
  const circuit = fakeCircuit();
  let circuitCalled = false;
  circuit.getProfile = async () => {
    circuitCalled = true;
    return null;
  };
  const handler = createHandler({ circuit });
  const res = createFakeRes();
  await handler({ method: "HEAD", query: { token: TOKEN } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null, "HEAD must not write a body");
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.equal(circuitCalled, false, "HEAD must not bother Circuit");
  assert.equal(res.ended, true);
});

test("HEAD with missing token returns 400 with no body", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "HEAD", query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, null);
  assert.equal(res.ended, true);
});

test("GET with valid token renders the form HTML with circuit.fm aesthetic", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(res.body, /<form action="\/api\/u\/save"/);
  assert.match(res.body, /Your profile/);
  assert.match(res.body, /name="token" value="valid-token-aaaaaaaaaaaaaaaa"/);
  // Brand tokens
  assert.match(res.body, /#FF4400/);
  assert.match(res.body, /Circuit/);
});

test("GET with ?saved=1 includes the toast HTML", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN, saved: "1" } }, res);
  assert.match(res.body, /class="toast"/);
  assert.match(res.body, /Saved\./);
});

test("GET without ?saved omits the toast", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  assert.doesNotMatch(res.body, /class="toast"/);
});

test("GET with ?error=CONSENT_REQUIRED renders the consent alert", async () => {
  const handler = createHandler({ circuit: fakeCircuit() });
  const res = createFakeRes();
  await handler(
    { method: "GET", query: { token: TOKEN, error: "CONSENT_REQUIRED" } },
    res,
  );
  assert.match(res.body, /class="alert"/);
  assert.match(res.body, /tick the consent box/);
});

test("GET pre-fills chips from existing profile values", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({
      profile: {
        email: "alex@example.com",
        organiserName: "Circuit",
        instagramHandle: "alex",
        neighbourhoods: ["shoreditch", "hackney"],
        availableNights: ["thu", "fri"],
        formatPreferences: ["show", "salon"],
      },
    }),
  });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  // Email shown to the user
  assert.match(res.body, /alex@example\.com/);
  // Instagram handle pre-filled (no leading @)
  assert.match(res.body, /value="alex"/);
  // Neighbourhood chips checked for the right two
  assert.match(res.body, /id="neighbourhoods-shoreditch"[^>]*\schecked/);
  assert.match(res.body, /id="neighbourhoods-hackney"[^>]*\schecked/);
  // Unchecked one stays unchecked
  assert.doesNotMatch(res.body, /id="neighbourhoods-mayfair"[^>]*\schecked/);
});

test("GET renders empty form when Circuit unreachable (graceful fallback)", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({ mode: "fail" }),
  });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<form action="\/api\/u\/save"/);
  // No "Editing for ..." line when we couldn't load the email
  assert.doesNotMatch(res.body, /Editing for/);
});

test("GET works with no circuit client at all (env not configured)", async () => {
  const handler = createHandler({ circuit: null });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<form action="\/api\/u\/save"/);
});

test("HTML-escapes user-controlled email content from Circuit", async () => {
  const handler = createHandler({
    circuit: fakeCircuit({
      profile: {
        email: "alex+<script>alert(1)</script>@example.com",
        organiserName: "Circuit",
        instagramHandle: null,
        neighbourhoods: [],
        availableNights: [],
        formatPreferences: [],
      },
    }),
  });
  const res = createFakeRes();
  await handler({ method: "GET", query: { token: TOKEN } }, res);
  assert.doesNotMatch(res.body, /<script>alert\(1\)<\/script>/);
  assert.match(res.body, /&lt;script&gt;/);
});
