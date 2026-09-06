---
description: Run the eval set and interpret the failures without changing anything
---

Run `npm run eval` and report:

1. The headline numbers: active vs inert rules, exact verdict match, false positive count.
2. Each false positive, and your read on whether the **rule** is too broad or the
   **label** is wrong. Say which, and why. Sometimes the label is wrong.
3. Each false negative, and which rule would need to exist or change to catch it.
4. Any rule that fired on nothing across the whole set. A rule that never fires is
   either dead weight or the eval set is missing a case for it. Say which you think.

Do not edit `standard/` in this command. Report only. Amending rules to make the
eval pass is overfitting to a few dozen examples, and the whole point of the set
is that a human decides what the failure means.
