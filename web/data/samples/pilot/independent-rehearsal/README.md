# Independent synthetic rehearsal

This is fictional test data created on 4 October 2026. It is not a partner export, paid pilot, or evidence of customer impact.

Upload `rehearsal_week_1.csv` to a dedicated test tenant. The CSV intentionally omits ground truth so detection cannot read its expected answers. `reference.json` records a corpus SHA-256, labels authored before detection, and a fixed random review sample containing both signal and nonsignal conversations. Do not change the reference to match model output.

The independent authored baseline is 55 opportunities in 100 conversations: 25 retention, 15 lead, 15 upsell, and 45 nonsignals. One conversation includes 100 support turns before its final request to exercise long-thread handling. These counts are test expectations, not an observed human team's operational baseline.

1. Verify the CSV checksum against the reference before importing.
2. Record detector/model/prompt versions and processed, skipped, and failed counts.
3. Review the fixed sample, including chats without detected signals. Compare against the reference only after review.
4. Measure missed signals, review time, and follow-up completion separately from precision.
5. Any outcomes entered during rehearsal must be marked simulated. No real partner outcome or paid decision has been supplied.

A real customer validation still requires an unused redacted export, independently observed historical baseline, reviewer identity and method, and partner-confirmed outcomes and commercial decision.
