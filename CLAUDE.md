# memnant

Project: not initialised — run `memnant init` first

memnant is available as an MCP server. Use it for institutional memory.

## Workflow

1. Call `project_brief` or `session_context` at the start of every session
2. Log decisions and framework fixes as they happen (see Instinctive Logging below)
3. Call `session_log` when the human says "done" — call `session_close` only when they explicitly say "close session"

## Instinctive Logging: Decisions

When you make or confirm a decision during work, log it silently — no announcement needed.

**Patterns to detect:**
- "Let's go with X" / "We'll use X"
- "X over Y because..." — comparative evaluations that resolve
- Architecture choices, technology selections, API design decisions
- Any choice between alternatives that has a rationale

**How to log:**
Call `log` with type `decision`. Structure the content as:
- **Question:** What was being decided?
- **Context:** What constraints or factors applied?
- **Decision:** What was chosen?
- **Rationale:** Why?

Log silently. Do not say "I'm logging this decision" — just log it.

## Instinctive Logging: Product Decisions

When a product, positioning, or messaging decision is made during conversation, log it the same way as code decisions — silently, as a `decision` with product-specific tags.

**Patterns to detect:**
- "Our positioning is..." / "We're positioning as..."
- "The messaging should..." / "The tagline is X because..."
- "We're differentiating on..." / "The competitive gap is..."
- "Competitors can't do X" / "What sets us apart is..."
- "The target user is... because..."
- "We chose X positioning over Y because..."
- Pricing decisions, naming decisions, audience refinements

**How to log:**
Call `log` with type `decision`. Tag with `product` plus a category: `positioning`, `messaging`, `competitive-intel`, `pricing`, or `target-audience`.

Structure the content as:
- **What:** The product decision
- **Why:** Reasoning, competitive context, user insight
- **Over:** Alternatives considered
- **Evidence:** Key facts that supported the decision

**Competitive analysis:** When competitive context comes up — what competitors do, what they can't do, market gaps — log it as a `decision` tagged `competitive-intel`. The connection graph will auto-link it to related positioning decisions.

Log silently. Same density as code decisions: 1-3 sentences, facts not narrative.

## Instinctive Logging: Framework Fixes

When you encounter an error, research it, find the fix, and verify it works — log the fix.

**Pattern:** error → research → fix → verify works
**Timing:** Log AFTER verification, not on first error. Only log fixes that actually work.

**How to log:**
Call `log` with type `framework_fix`. Auto-tag with the framework/library name.
Content: Problem → Environment → Solution → Verification.

Log after the fix is confirmed working. Do not log speculative fixes.

## Instinctive Logging: Rejections

When an approach is tried and rejected, log it so future sessions don't repeat the mistake.

**Patterns to detect:**
- "That didn't work because..."
- "Tried X but..." followed by reverting
- An approach that was implemented then rolled back
- A library/tool evaluated then discarded

**How to log:**
Call `log` with type `decision` and tag `rejected`.
Content: Approach → Why rejected → What worked instead.

## Logging Taste Guide

**Worth logging:**
- Architecture decisions (database choice, API patterns, state management)
- Technology choices (libraries, frameworks, services)
- Framework gotchas that took >5 minutes to solve
- Rejected approaches (so they aren't retried)
- Spec constraints discovered during work
- Positioning decisions (why this angle, what competitors can't do)
- Messaging choices (tagline rationale, value prop evolution)
- Competitive analysis (market gaps, feature comparisons)

**Not worth logging:**
- Code formatting preferences (use linter config)
- Routine code that's obvious from the diff
- Trivially reversible changes
- Information already captured in git history

**Threshold:** Would a returning developer 3 weeks from now need this?

**Density:** 1-3 sentences per record. Dense, not verbose. Facts, not narrative.

## Session Log vs Session Close

**`session_log`** — Log progress without ending the session. Use when the human says "done", "that's it for now", "let's wrap up this part", or signals a milestone. The session stays active.

**`session_close`** — Log AND end the session. Use only when the human explicitly says "close session", "session close", or "end session".

**Default to `session_log`.** Most "done" signals mean "done with this task", not "end the session".

**Summary template (for both):**
- **Shipped:** What was completed
- **Decisions:** Key choices made and why
- **Rejected:** Approaches tried and abandoned
- **Gotchas:** Framework issues, unexpected behaviour
- **TODOs:** What's next, what was deferred

No permission needed — just log. The human expects it.

## MCP Tools

- `recall` — Search prior decisions before making new ones
- `log` — Record decisions, framework fixes, session logs
- `session_context` — Get compiled context at session start
- `session_log` — Log a progress summary (session stays active)
- `session_close` — Close the session with a summary log
- `status` — Check project health and staleness
- `check_copy` — Validate text against copy specs
- `check_design` — Validate against design system specs
- `synthesise` — Ask a question that spans multiple records
- `context_for_file` — Get records relevant to a specific file
- `project_brief` — Get a 500-token dynamic project brief
