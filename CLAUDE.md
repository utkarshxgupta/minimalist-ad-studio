# Minimalist Ad Studio — project constitution

Internal tool prototype for Minimalist (beminimalist.co). Two surfaces over one
shared, versioned standard.

## Thesis

The brief describes the bottleneck as "reviewers disagree with each other and
rejected ads bounce back and forth for days." That is not a speed problem. It is
an **unwritten-standard problem**: review is non-deterministic and unaccountable
because nobody can point at a rule.

So the product is not "AI writes ads, AI grades ads." It is **one codified brand
and legal standard, versioned in this repo, applied at generation time and at
review time.** `standard/` is the product. `app/` is where it gets applied.

The expensive failure in marketing AI is publishing something wrong, not writing
something bland. Every design tradeoff resolves in that direction.

## Invariants (do not violate without an explicit decision + a doc update)

1. **Every finding cites a rule ID from `standard/`.** No finding may be produced
   by a model opinion that is not anchored to a written rule.
2. **Every rule cites its source** and is labelled `corpus` (observed on
   beminimalist.co), `regulation` (statute/code text), or `inference` (ours).
   Inference rules must say so. We do not launder guesses as law.
3. **Span verification.** A model finding must quote the exact substring it is
   flagging. If that substring is not present verbatim in the input, the finding
   is dropped in code. Non-negotiable anti-hallucination check.
4. **Claim grounding.** Generated ad copy may not assert a benefit, ingredient,
   or concentration that is not present in the scraped `ProductFacts`. No
   exceptions, no "reasonable inference."
5. **The product image is never generated.** Real product photograph only. The
   pack, the label, and the printed concentration are photographic. Generation is
   permitted for backgrounds and environments only, and generated backgrounds are
   themselves scored (a dewy-glowing-skin backdrop is an implied efficacy claim).
6. **BLOCK findings are not loopable.** See severity, below.

## Severity taxonomy

Mirrors the brief's framing of what an agent does alone / refuses / escalates.

| Severity | Dimension | Behaviour |
|---|---|---|
| `BLOCK` | policy & claims | Never auto-passed. Creative is not rendered as finished. Export disabled. Escalates to human. |
| `WARN`  | brand tone, brand language | Renders. Export allowed with a logged override reason. |
| `PASS`  | — | Exports freely. |

**BLOCK findings must not be auto-rewritten.** If the copy says "cures acne" and
the loop rewrites to "helps clear acne," compliance did not improve; we just
found phrasing the detector misses. That is Goodharting our own scorer. A BLOCK
means the claim is unsupported by `ProductFacts`, so the correct action is to
**drop the claim**, not rephrase it. WARN findings are loopable, capped at 2
iterations, and the attempt chain is logged and shown.

## Scorer architecture

Two layers. Every finding is tagged with which layer produced it, so a reviewer
knows how much to trust it.

- **Layer 1, deterministic** (`lib/scorer/deterministic.ts`). Lexicon and pattern
  matching. Same input, same output, always. This is what makes the tool a
  standard rather than a second opinion.
- **Layer 2, model judgment** (`lib/scorer/model.ts`). Gemini Flash, rulebook in
  context, **one call per dimension** run in parallel. Separate calls because a
  single prompt doing three jobs bleeds: tone concerns contaminate legal
  judgments, and you cannot tune one dimension without disturbing the others.

Structured output validated with zod. Parse failure retries once, then fails
loudly rather than degrading silently.

## Working agreements for agents in this repo

- **Verify every regulatory citation against actual source text before it enters
  `standard/SOURCES.md`.** Confidently-stated but non-existent clause numbers are
  the single most likely failure here, and a rulebook citing a fake clause would
  be a fatal finding in a project about unsubstantiated claims.
- **Run the eval before and after any change to `standard/`.** A hook does this
  automatically. Report the delta, including regressions.
- **Never auto-amend a rule to make the eval pass.** That is overfitting to 30
  examples. Surface the failure, and let a human decide whether the rule is wrong
  or the label is wrong. Sometimes the label is wrong.
- **False positives matter more than recall.** A scorer that blocks everything
  gets abandoned in week two, and abandonment is the failure mode that actually
  costs money.
- Commit in small, meaningful increments. History is a graded deliverable and
  must not be squashed.

## Deliberately rejected

Named here because rejecting complexity is a decision, not an omission.

- **RAG over the rulebook.** It fits in context. Retrieval adds a failure mode
  and removes determinism.
- **Agent frameworks (LangChain, CrewAI) in the app.** They hide the judgment
  this project exists to make visible. Plain SDK calls.
- **Multi-agent debate per ad.** Slower, costlier, less reproducible, and it
  makes the standard unauditable.
- **LLM-as-judge for evaluating the scorer.** We have human labels. Labels beat a
  judge.
- **Fine-tuning, vector DB, multi-tenant auth.** Out of scope for a prototype.

## Commands

| Command | What |
|---|---|
| `npm run dev` | App on :3000 |
| `npm run eval` | Score the labelled set, print confusion matrix + per-rule breakdown |
| `npm run redteam` | Adversarial round: generate attack ads, score, log survivors |

## Style

No em dashes in any prose written in this repo.
