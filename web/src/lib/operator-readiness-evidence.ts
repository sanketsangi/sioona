/** Historical repository evidence only. Not a live schema or acceptance assertion.
 * Sources: docs/development/evidence/staging-bootstrap-receipt.json and
 * docs/development/LAUNCH_BLOCKERS_2026-10-17.md at implementation base efdee0f1.
 */
export const bootstrapEvidence = {
  timestamp: "2026-10-17T14:13:07.147611+00:00",
  schema: "034_operational_telemetry",
  memberships: 6,
  status: "Bootstrap checks passed; hosted OP-2 acceptance pending",
};
export const acceptanceGates = [
  {
    id: "OP-2",
    label: "Staging actor, browser/session and tenant-isolation acceptance",
  },
  {
    id: "OP-3 / CB-10",
    label: "Populated cutover, restore rehearsal and signed observation",
  },
  {
    id: "OP-4",
    label:
      "Pause propagation, provider/ledger reconciliation and alert delivery",
  },
  {
    id: "CB-18",
    label:
      "Session-preserving export, legal hold, deletion and restore acceptance",
  },
];
