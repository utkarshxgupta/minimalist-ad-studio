#!/usr/bin/env node
/**
 * PostToolUse hook. Fires the eval whenever anything under standard/ is written.
 *
 * The point: you cannot change a rule without immediately seeing what it cost
 * you elsewhere. Automate the running of the eval, never the deciding.
 *
 * Reads the hook payload on stdin, ignores writes outside standard/, and prints
 * the eval summary back into the session.
 */
import { execSync } from "node:child_process";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const path = payload?.tool_input?.file_path ?? "";
  if (!/[\\/]standard[\\/]/.test(path)) process.exit(0);

  console.log(`\n[hook] ${path.split(/[\\/]/).pop()} changed. Re-running eval.`);
  try {
    const out = execSync("npm run eval --silent", { encoding: "utf8", stdio: "pipe" });
    // Keep the session output tight: the headline numbers, not the whole report.
    const keep = out
      .split("\n")
      .filter((l) =>
        /Rulebook|active:|inert:|Exact verdict match|FALSE POSITIVES|False negatives/.test(l)
      );
    console.log(keep.join("\n"));
    console.log("[hook] Full report: npm run eval\n");
  } catch (e) {
    console.log("[hook] Eval failed:\n" + (e.stdout || e.message));
  }
});
