import type { Verdict } from "./types";

/**
 * The override log.
 *
 * A WARN exports, but only with a reason attached, and the reason is kept. This
 * is the artefact that replaces the Slack thread: six months later the question
 * "why did we run this one" has a written answer instead of an argument.
 *
 * Stored in the browser, and labelled as such in the UI. A prototype that wrote
 * this to a module-level array on the server would look durable and lose every
 * entry on the next deploy, which is worse than being visibly local: an audit
 * trail nobody can trust is more dangerous than no audit trail at all, because
 * people rely on it.
 */

const KEY = "minimalist-ad-studio.overrides";
const LIMIT = 50;

export interface OverrideEntry {
  at: string;
  product: string;
  verdict: Verdict;
  rules: string[];
  reason: string;
  copy: string;
}

export function readOverrides(): OverrideEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OverrideEntry[]) : [];
  } catch {
    return [];
  }
}

export function logOverride(entry: OverrideEntry): void {
  if (typeof window === "undefined") return;
  try {
    const next = [entry, ...readOverrides()].slice(0, LIMIT);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage disabled; the export still happens, the note is just not kept */
  }
}
