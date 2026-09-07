# Fixtures

Two different things live here, for two different reasons.

## `products/*.json`

Committed `ProductFacts` snapshots for the eight products the rulebook corpus
was derived from. The generator fetches live; these are the fallback when the
storefront is unreachable, rate-limiting, or has moved its markup.

A snapshot is never presented as a live read. The UI shows `fetchedAt` and says
the facts came from a cache, because a stale page passed off as current is the
same species of quiet dishonesty this project exists to catch.

Refresh with `npm run snapshot`. Force this path with `AD_STUDIO_OFFLINE=1`.

## `pages/*.html`

Two full product pages, used by `npm run test:extract` so the parser can be
tested with no network and no API key.

**These are trimmed, not byte-exact.** `<style>` blocks, stylesheet links, and
every `<script>` that is not `application/ld+json` are stripped, which removes
about 60 percent of the bytes. The parser reads DOM structure and JSON-LD only,
so nothing it looks at was removed. Recorded here rather than in a commit
message so nobody later mistakes a fixture for a faithful capture.
