/**
 * Internal citation check.
 *
 * The rulebook cited `docs/FAILURE-MODES.md` as the source of POLICY-012 for
 * two commits before that file existed. Regulatory citations got verified
 * because a working agreement says to verify them; internal ones had nothing
 * forcing a check, so nothing checked them. See docs/CORRECTIONS.md C-005.
 *
 * This is the forcing function. Every repo-relative path referenced from the
 * standard or the docs must exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, ok, report } from "./assert";

/**
 * Files that make citations a reader is expected to be able to follow.
 *
 * This started narrower. docs/DESIGN.md was excluded because it named
 * docs/DECISIONS.md before that file existed, which is a legitimate thing for a
 * design note to do and an illegitimate thing for a rule to do. The decision doc
 * is now written, so the carve-out has no justification left and is gone.
 */
const SOURCES = [
  "README.md",
  "CLAUDE.md",
  "standard/claims.rules.yaml",
  "standard/claims-registry.yaml",
  "standard/SOURCES.md",
  "standard/regulatory-sources.md",
  "docs/CORRECTIONS.md",
  "docs/FAILURE-MODES.md",
  "docs/KNOWN-LIMITATIONS.md",
  "docs/DECISIONS.md",
  "docs/DECISION-LOG.md",
  "docs/DESIGN.md",
  "docs/RULE-PROPOSALS.md",
];

/**
 * A repo-relative path: at least one slash and a real file extension.
 *
 * An earlier version also matched a bare `word/` so that directory references
 * would be checked. It read "29/29", "before/after" and "HTML/CSS" as paths.
 * Directories are not checked; a missing one shows up as missing files anyway.
 *
 * The extensions are ordered longest first, and that ordering is load-bearing
 * rather than tidy. Alternation is first-match-wins, so with `ts` ahead of
 * `tsx` this pattern read `app/page.tsx` as `app/page.ts`, then reported the
 * file it had just invented as missing. It sat latent until the first doc in
 * this repo cited a `.tsx` file, at which point the checker failed a correct
 * citation and blamed the writer. The lookahead stops the same class of
 * truncation without depending on the ordering at all.
 */
const PATH_PATTERN =
  /\b((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:tsx|jsonl|yaml|json|mjs|yml|css|ts|md)(?![A-Za-z0-9]))/g;

function citationsIn(file: string): string[] {
  const raw = readFileSync(join(process.cwd(), file), "utf8");

  // Strip URLs first. https://beminimalist.co/products/x is not a file path,
  // and a naive scan reads every link in the sources file as a missing file.
  const text = raw.replace(/https?:\/\/\S+/g, " ");

  const found = new Set<string>();
  for (const m of text.matchAll(PATH_PATTERN)) {
    const p = m[1].replace(/[.,)]+$/, "");
    if (!p || p.startsWith("node_modules")) continue;
    found.add(p);
  }
  return [...found];
}

for (const file of SOURCES) {
  check(`${file} cites only paths that exist`, () => {
    ok(existsSync(join(process.cwd(), file)), `${file} is itself missing`);

    const missing = citationsIn(file).filter((p) => !existsSync(join(process.cwd(), p)));
    ok(
      missing.length === 0,
      `${file} references ${missing.length} path(s) that do not exist:\n      ${missing.join("\n      ")}`
    );
  });
}

report();
