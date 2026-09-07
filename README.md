# Minimalist Ad Studio

Internal tool prototype for [Minimalist](https://beminimalist.co). Two surfaces
over one shared, versioned standard.

```bash
npm install
cp .env.example .env.local     # add a Gemini API key
npm run dev                    # http://localhost:3000
```

No key? The app still runs. Layer 2 reports itself as `skipped:no-api-key` and
the deterministic layer scores on its own. No network? Set
`AD_STUDIO_OFFLINE=1` and the generator reads committed product snapshots.

## The argument

The brief describes the bottleneck as reviewers disagreeing with each other
while rejected ads bounce back and forth for days. That is not a speed problem.
It is an **unwritten-standard problem**: review is non-deterministic and
unaccountable because nobody can point at a rule.

So the product is not "AI writes ads, AI grades ads". It is **one codified brand
and legal standard, versioned in this repo, applied at generation time and at
review time**. [`standard/`](standard/) is the product. `app/` is where it gets
applied.

Everything else follows from that. The generator writes against the same
rulebook the reviewer scores against, so the two surfaces cannot disagree. Every
finding cites a rule ID. Every rule cites its source and says whether that
source is the brand's own copy, a regulation, or our inference.

## The two surfaces

**Generate** (`/`). A product URL in, a scored 1080x1080 creative out. The page
is fetched server-side, parsed into `ProductFacts` with no model involved, and
every claim in the generated copy must trace to a field in those facts. The
creative self-scores before it renders.

**Review** (`/review`). Paste any ad. Each finding carries the rule ID, the
exact words it objects to, why, and what to do instead.

## The gate

| Verdict | What happens |
|---|---|
| `PASS` | Renders. Exports on one click. |
| `WARN` | Renders. Export demands a reason, and the reason is logged. |
| `BLOCK` | **No finished creative is rendered.** Export disabled. Escalates. |

A BLOCK is never auto-rewritten. If copy says "cures acne" and a loop rewrites
it to "helps clear acne", compliance did not improve; we just found phrasing the
detector misses. A BLOCK means the claim is unsupported, so the fix is to drop
the claim, and that is a decision a person makes. WARN findings are loopable,
capped at two retries, and the retry is told what was wrong rather than shown
the rejected sentence.

## How scoring works

Two layers, and every finding says which one produced it, so a reviewer knows
how much to trust it.

- **Layer 1, deterministic** (`lib/scorer/deterministic.ts`). Lexicon and
  pattern matching. Same input, same output, forever. This is what makes the
  tool a standard rather than a second opinion.
- **Layer 2, judgment** (`lib/scorer/model.ts`). Gemini Flash with the rulebook
  in context, one call per dimension, in parallel. Separate calls because a
  single prompt doing three jobs bleeds: tone concerns contaminate legal
  judgments.

Three controls sit on top of the model:

1. **Span verification.** A model finding must quote the exact substring it is
   flagging. If that substring is not in the input verbatim, the finding is
   dropped in code, and the drop count is shown.
2. **Rule verification.** A finding citing a rule ID that does not exist is
   discarded. A model does not get to invent authority any more than an
   advertiser does.
3. **Fail closed.** If the policy call fails after a retry, the verdict is
   forced to BLOCK. An unrun compliance check must never read as a pass.

## Claim grounding

Generated copy may not assert a benefit, ingredient or concentration absent from
the scraped `ProductFacts`. Enforced twice, because neither check is sufficient
alone:

- the generator emits a **claim trace**, and the trace is verified in code: the
  supporting text must appear verbatim in the facts, and the claim must appear
  verbatim in the ad;
- the **scorer** then runs over the finished copy with the same facts attached,
  and does not care what the generator chose to declare.

The trace catches the confident mistake. The scorer catches the convenient
omission, which is what a model does when it simply leaves a claim out of its
own trace.

## Imagery

**The product photograph is never generated.** The pack, the label and the
printed concentration are photographic, because a generated label is a
fabricated fact about a real product. Only the environment behind it may be
generated, and generated environments are themselves scored: a backdrop of dewy
glowing skin is an efficacy claim made in pixels instead of words.

That check has two layers too. A deny-list runs over the marketer's background
hint before an image model is ever called, which is the only control that runs
before the money is spent. The returned image is then scored against the policy
rules. Image findings are tagged `image` rather than blended in, because they
have no span to verify and a reviewer should weight them differently.

## Commands

| Command | What |
|---|---|
| `npm run dev` | App on :3000 |
| `npm run eval` | Score the labelled set, print confusion matrix and per-rule breakdown |
| `npm run redteam` | Adversarial round: generate attack ads, score, log survivors |
| `npm run generate -- <url>` | The generator, headless. `--angle`, `--background generated`, `--out bg.jpg` |
| `npm test` | Extraction, gate and citation checks. Offline, no API key |
| `npm run snapshot` | Refresh the committed product snapshots |

## Layout

```
standard/          the product: rules, sources, substantiation registry
  claims.rules.yaml
  SOURCES.md
  claims-registry.yaml
lib/scorer/        two-layer scorer, prompts assembled from standard/
lib/generator/     fetch, extract, copy, background, gate
eval/dataset.jsonl 29 labelled ads, including hard negatives
docs/              decisions, failure modes, design record, corrections
fixtures/          committed product snapshots and parser fixtures
```

## The written record

[`docs/DECISIONS.md`](docs/DECISIONS.md) is the one-page argument: what was
decided, what was rejected, and what the evidence is worth.
[`docs/FAILURE-MODES.md`](docs/FAILURE-MODES.md) is where this system is weak,
stated plainly.

Commits are the working record and are not squashed.
[`docs/CORRECTIONS.md`](docs/CORRECTIONS.md) logs where this agent was wrong and
how it was caught, including two regulatory citations that were confidently
wrong before verification. A tool that judges other people's claims should be
able to show its own error rate.
