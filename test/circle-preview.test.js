// Phase 3 Sub-PR 11B — non-member circle preview at /c/<memberCode>.
// Tests the dispatcher path that calls meetcircuit.com when the path
// parameter starts with `mbr_`.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/c/[chipUid].js");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

// `chipUid` here is the path-parameter name kept for backward compat
// with the legacy route — the value is actually a memberCode when it
// starts with `mbr_`.

function activePreviewResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        subject: {
          id: "gp-pj",
          displayName: "PJ",
          photoUrl: null,
          memberCode: "mbr_abc",
        },
        connections: [
          { id: "gp-1", displayName: "Alicia", photoUrl: null },
          { id: "gp-2", displayName: "Theo", photoUrl: null },
          { id: "gp-3", displayName: "Naia", photoUrl: null },
        ],
      },
    }),
  };
}

function gonePreviewResponse() {
  return {
    ok: false,
    status: 410,
    json: async () => ({ error: "This invite is invalid or expired" }),
  };
}

function patchedFetch(response) {
  let calledWith = null;
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    calledWith = { url, opts };
    return response;
  };
  return {
    restore: () => {
      global.fetch = original;
    },
    get url() {
      return calledWith && calledWith.url;
    },
  };
}

test("GET /c/<mbr_*> renders the circle names list on first view + sets cookie", async () => {
  const fetchPatch = patchedFetch(activePreviewResponse());
  try {
    const { handler } = { handler: createHandler({ db: createFakeFirestore() }) };
    const res = createFakeRes();

    await handler(
      {
        method: "GET",
        query: { chipUid: "mbr_abc" },
        headers: {},
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /PJ/);
    assert.match(res.body, /Alicia/);
    assert.match(res.body, /Theo/);
    assert.match(res.body, /Naia/);
    assert.match(res.body, /Get on the list/);
    // Cookie set on first view
    const cookie = res.headers["Set-Cookie"];
    assert.match(cookie, /^circle_window_mbr_abc=\d+/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    // Calls the meetcircuit.com preview endpoint
    assert.match(fetchPatch.url, /\/api\/circles\/preview\/mbr_abc$/);
  } finally {
    fetchPatch.restore();
  }
});

test("GET /c/<mbr_*> renders lapsed view when cookie is older than 24h", async () => {
  const fetchPatch = patchedFetch(activePreviewResponse());
  try {
    const { handler } = { handler: createHandler({ db: createFakeFirestore() }) };
    const res = createFakeRes();
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;

    await handler(
      {
        method: "GET",
        query: { chipUid: "mbr_abc" },
        headers: {
          cookie: `circle_window_mbr_abc=${twentyFiveHoursAgo}`,
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /window closed/i);
    assert.match(res.body, /Get on the list/);
    // Names should NOT appear in the lapsed view
    assert.doesNotMatch(res.body, /Alicia/);
  } finally {
    fetchPatch.restore();
  }
});

test("GET /c/<mbr_*> renders names again on a re-view inside the 24h window", async () => {
  const fetchPatch = patchedFetch(activePreviewResponse());
  try {
    const { handler } = { handler: createHandler({ db: createFakeFirestore() }) };
    const res = createFakeRes();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    await handler(
      {
        method: "GET",
        query: { chipUid: "mbr_abc" },
        headers: { cookie: `circle_window_mbr_abc=${oneHourAgo}` },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Alicia/);
    // Don't re-issue the cookie on subsequent views
    assert.equal(res.headers["Set-Cookie"], undefined);
  } finally {
    fetchPatch.restore();
  }
});

test("GET /c/<mbr_*> returns 410 when meetcircuit returns 410", async () => {
  const fetchPatch = patchedFetch(gonePreviewResponse());
  try {
    const { handler } = { handler: createHandler({ db: createFakeFirestore() }) };
    const res = createFakeRes();

    await handler(
      {
        method: "GET",
        query: { chipUid: "mbr_unknown" },
        headers: {},
      },
      res
    );

    assert.equal(res.statusCode, 410);
  } finally {
    fetchPatch.restore();
  }
});

test("GET /c/<chipUid> (legacy UUID, no mbr_ prefix) routes through Circuit organiser API", async () => {
  // Post-Phase-4 consolidation: the legacy chipUid path no longer touches
  // Firestore — it goes through circuitClient.lookupCardByChip. The
  // dispatcher still recognises non-mbr_ codes as chipUids and skips the
  // Phase 3 mbr_* preview branch.
  const circuitClient = {
    async lookupCardByChip(chipUid) {
      if (chipUid !== "legacy-uuid-123") return null;
      return {
        memberCode: "mbr_LEGACY",
        chipUid: "legacy-uuid-123",
        voided: false,
        claim: {
          claimedAt: "2026-04-24T00:00:00.000Z",
          globalProfile: {
            id: "gp-legacy",
            displayName: "Legacy Member",
            photoUrl: null,
          },
        },
      };
    },
  };
  const handler = createHandler({ circuitClient });
  const res = createFakeRes();

  await handler(
    {
      method: "GET",
      query: { chipUid: "legacy-uuid-123" },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Legacy Member/);
  assert.match(res.body, /gave you their card/);
});

// Sub-PR 24 — avatars on the circle preview.

test("GET /c/<mbr_*> renders fallback initials when photoUrl is null", async () => {
  const fetchPatch = patchedFetch(activePreviewResponse());
  try {
    const handler = createHandler({ db: createFakeFirestore() });
    const res = createFakeRes();
    await handler(
      { method: "GET", query: { chipUid: "mbr_abc" }, headers: {} },
      res
    );
    // Subject's avatar (large) — photoUrl null in fixture, so initial 'P'
    // appears inside an avatar-fallback span.
    assert.match(res.body, /class="avatar avatar-lg avatar-fallback"[^>]*>P<\/span>/);
    // Connection avatars (small) for Alicia/Theo/Naia.
    assert.match(res.body, /class="avatar avatar-sm avatar-fallback"[^>]*>A<\/span>/);
    assert.match(res.body, /class="avatar avatar-sm avatar-fallback"[^>]*>T<\/span>/);
    assert.match(res.body, /class="avatar avatar-sm avatar-fallback"[^>]*>N<\/span>/);
  } finally {
    fetchPatch.restore();
  }
});

test("GET /c/<mbr_*> renders <img> when photoUrl is present", async () => {
  const fetchPatch = patchedFetch({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        subject: {
          id: "gp-pj",
          displayName: "PJ",
          photoUrl: "https://cdn.example/pj.jpg",
          memberCode: "mbr_abc",
        },
        connections: [
          {
            id: "gp-1",
            displayName: "Alicia",
            photoUrl: "https://cdn.example/alicia.jpg",
          },
        ],
      },
    }),
  });
  try {
    const handler = createHandler({ db: createFakeFirestore() });
    const res = createFakeRes();
    await handler(
      { method: "GET", query: { chipUid: "mbr_abc" }, headers: {} },
      res
    );
    // Subject's photoUrl rendered as <img>
    assert.match(res.body, /<img src="https:\/\/cdn\.example\/pj\.jpg"/);
    // Connection's photoUrl rendered as <img>
    assert.match(res.body, /<img src="https:\/\/cdn\.example\/alicia\.jpg"/);
  } finally {
    fetchPatch.restore();
  }
});
