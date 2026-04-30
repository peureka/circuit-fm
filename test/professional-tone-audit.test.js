// Professional tone audit — Circuit CI gate.
//
// Mirrors `circuit/src/lib/professional-tone-audit.test.ts`. Scans
// member-facing surfaces (the homepage, the release form, the
// manifesto, and the HTML rendered by /api/u/<token> + /api/c/<chipUid>)
// for banned vocabulary defined in `lib/banned-patterns.js`.
//
// Per CIRCUIT_FM_DESIGN_BRIEF.md §B.6, this CI gate exists to prevent
// drift back to the gamification / hype register when copy is edited.
//
// Excluded surfaces:
//   - admin.html, board.html — operator-side, not member-facing
//   - privacy.html, terms.html — legal copy where banned words may
//     appear inside legitimate citations / definitions
//   - api/admin, api/webhooks — never rendered to members

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { findBannedMatch, BANNED_PATTERNS } = require("../lib/banned-patterns");

const REPO_ROOT = join(__dirname, "..");

// Files that ship copy to members. Anything visible at circuit.fm/<route>
// to a non-operator user belongs in this list. The test reads each file's
// source, strips code/script/style/comment context, and runs the banned-
// pattern matcher on the remaining text.
const MEMBER_SURFACE_FILES = [
  "index.html",
  "release.html",
  "manifesto.html",
  "api/c/[chipUid].js",
  "api/u/[token].js",
];

// Allowed in source code as identifiers, function names, or technical
// comments — NOT in user-visible copy. The line-filter below removes
// most of these, but a few survive (e.g. function names in `module.exports`).
// We keep the allowlist conservative so a real banned-word hit isn't masked.
const SOURCE_CODE_ALLOWLIST_LINE = /\b(BANNED_PATTERNS|findBannedMatch|validateTone|escapeRegExp|maskAllowed|allowedSubstrings)\b/;

/**
 * Strip <script>...</script> and <style>...</style> blocks from HTML so
 * keywords inside JS/CSS don't trigger the audit.
 */
function stripScriptAndStyle(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

/**
 * Strip JS/single-line comments, import/declaration lines, and lines
 * that are pure code (variable assignment, conditionals, function
 * definitions). What remains is roughly the user-visible string content
 * inside template literals.
 *
 * Multi-line server-internal calls (`console.error(...)` and
 * `throw new XYZ(...)`) are stripped en bloc *before* the line-filter,
 * because their second-and-later lines look like bare template literals
 * and would otherwise pass the per-line heuristics.
 */
function filterUserFacingLines(content) {
  // Strip /* block comments */ first (multi-line comments leak banned
  // words like "level" inside HTTP status descriptions).
  const noBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip multi-line console/throw calls. The match is balanced-naive
  // (non-greedy until first matching paren), which works for the
  // simple template-literal payloads used in this codebase.
  const noLogs = noBlockComments
    .replace(/\bconsole\.(log|error|warn|info|debug)\s*\([\s\S]*?\)\s*;?/g, "")
    .replace(/\bthrow\s+new\s+\w+\s*\([\s\S]*?\)\s*;?/g, "");
  return noLogs
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith("//")) return false;
      if (trimmed.startsWith("import ")) return false;
      if (trimmed.startsWith("require(")) return false;
      if (trimmed.startsWith("const ") || trimmed.startsWith("let ") || trimmed.startsWith("var ")) {
        return false;
      }
      if (trimmed.startsWith("if (") || trimmed.startsWith("} else") || trimmed.startsWith("return ")) {
        return false;
      }
      if (trimmed.startsWith("function ") || trimmed.startsWith("module.exports")) return false;
      // Internal log + throw lines are never rendered to a member.
      if (/^\s*console\.(log|error|warn|info|debug)\b/.test(trimmed)) return false;
      if (trimmed.startsWith("console.")) return false;
      if (trimmed.startsWith("throw ")) return false;
      // Test scaffolding inside .js files (we don't scan tests, but be
      // safe if a .js handler ever sits next to a test fixture).
      if (trimmed.startsWith("test(") || trimmed.startsWith("assert.")) return false;
      if (SOURCE_CODE_ALLOWLIST_LINE.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

function loadCopyForFile(relativePath) {
  const raw = readFileSync(join(REPO_ROOT, relativePath), "utf8");
  if (relativePath.endsWith(".html")) {
    return stripScriptAndStyle(raw);
  }
  if (relativePath.endsWith(".js")) {
    return filterUserFacingLines(raw);
  }
  return raw;
}

test("BANNED_PATTERNS list is non-empty and uses regex objects", () => {
  assert.ok(Array.isArray(BANNED_PATTERNS));
  assert.ok(BANNED_PATTERNS.length > 0);
  for (const pat of BANNED_PATTERNS) {
    assert.ok(pat instanceof RegExp, `expected RegExp, got ${typeof pat}`);
  }
});

test("findBannedMatch returns null for the canonical FM voice lines", () => {
  // Reference lines from CIRCUIT_FM_DESIGN_BRIEF.md §B.4 / §B.5 — the
  // copy that *defines* the Member voice register. If any of these trip
  // the audit, the audit's broken, not the copy.
  const canonical = [
    "A members' club with no house. It moves with you.",
    "Tap in at any venue. See who's here. Connect if you want to.",
    "After that the window closes.",
    "We never track you across organisers without consent.",
    "X gave you their card. That's how Circuit works.",
    "OFFLINE · CHECK-INS STILL WORK",
    "DIDN'T CATCH",
    "YOU'RE IN",
    "London 2026.",
  ];
  for (const line of canonical) {
    const match = findBannedMatch(line);
    assert.equal(
      match,
      null,
      match
        ? `Canonical line "${line}" tripped /${match.pattern}/: "${match.match}"`
        : "",
    );
  }
});

test("findBannedMatch flags known-bad copy", () => {
  const bad = [
    "Unlock exclusive rewards by attending more events!",
    "You've achieved Level 3. Congratulations!",
    "Don't miss this — last chance to claim your badge.",
    "You're a Circuit FM Core Member.",
    "Top 10% of Regulars in your borough.",
  ];
  for (const line of bad) {
    const match = findBannedMatch(line);
    assert.notEqual(match, null, `Expected "${line}" to trip the audit`);
  }
});

test("Member-facing surfaces contain no banned vocabulary", () => {
  const failures = [];
  for (const relativePath of MEMBER_SURFACE_FILES) {
    const copy = loadCopyForFile(relativePath);
    const match = findBannedMatch(copy);
    if (match) {
      // Locate the line for a nicer error
      const lines = copy.split("\n");
      const hitLine = lines.find((l) => new RegExp(match.pattern, "i").test(l));
      failures.push(
        `${relativePath} contains banned pattern /${match.pattern}/: "${match.match}"\n  → ${hitLine?.trim()}`,
      );
    }
  }
  assert.equal(
    failures.length,
    0,
    failures.length > 0 ? `\n${failures.join("\n")}` : "",
  );
});
