---
name: numguard
description: Verify every number in an answer against the tool outputs of this session before sending it. Use whenever a final answer states numbers that came from data (SQL or dataframe results, API JSON, CSV files, logs, command output): totals, rates, percentages, averages, counts, money.
---

# numguard: never state a number you did not compute

Rule: every number in your final answer must appear in a tool output from this session, exactly or as a
rounding of it (0–2 decimals), a fraction written as a percent (0.593 → 59.3%), or a k/M/B abbreviation
(1,234,567 → $1.23M). A number you worked out in your head does not count; run the computation with a tool first.

## Before you send an answer that contains numbers

1. Collect the raw outputs the answer is based on (query results, JSON responses, CSV contents, stdout).
2. Check the draft:
   - If the `numguard_check` MCP tool is available, call it with `answer` = your draft, `sources` = the raw outputs
     (verbatim, not summarized), and `question` = the user's message.
   - Otherwise save the draft and the outputs to files and run:
     ```bash
     npx -y github:isaacbitran/numguard check draft.txt --source result1.csv --source result2.json --question "<user's question>"
     ```
     Exit code 0 means every number is vouched; 1 lists the unvouched numbers with their context.
3. For each flagged number, do one of:
   - **Recompute it with a tool** (a query, a script, a calculator call) and use that output's value. The new output
     counts as a source for the next check.
   - **Correct it** to the value the source actually shows.
   - **Remove it** if no tool output supports it.
4. Re-run the check until it passes, then send the answer.

## Do not

- Do not echo a number through a tool (`echo 81%`) to make it pass. That defeats the check; compute it from data.
- Do not round in a way the source does not support (18.67 may become 18.7 or 19, not 18.6).
- Do not drop numbers the user needs just to pass; recompute them instead.

## What the check ignores

Years, dates, times, ordinals (2nd), list markers (1.), version numbers, labels (Q3, step 4, #42), plain counts 0–3,
fenced code blocks, URLs, and any number that appears in the user's question.

## What it cannot catch

A real number attached to the wrong thing (another row's value, the wrong metric) passes, because the number does
appear in the outputs. Low-precision numbers (9%, 12) can also match an unrelated value by coincidence. Read your
claims against the rows they cite.
