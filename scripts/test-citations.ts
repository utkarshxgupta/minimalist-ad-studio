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
 * docs/DESIGN.md and docs/RULE-PROPOSALS.md are deliberately absent. They are
 * working records and they name planned artefacts before those exist, which is
 * a legitimate thing for a design note to do and an illegitimate thing for a
 * rule to do. As of writing, the one such forward reference is
 * docs/DECISIONS.md, the decision doc that is written last.
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
];

/**
 * A repo-relative path: at least one slash and a real file extension.
 *
 * An earlier version also matched a bare `word/` so that directory references
 * would be checked. It read "29/29", "before/after" and "HTML/CSS" as paths.
 * Directories are not checked; a missing one shows up as missing files anyway.
 */
const PATH_PATTERN =
  /\b((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:md|ts|tsx|mjs|yaml|yml|jsonl|json|css))/g;

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
