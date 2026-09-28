# Signal detection eval

Promptfoo scores the Groq Qwen classifier used by Detect v2. The provider posts the same chat body as `classifyConversationWithGroq` in `src/lib/detect-llm.ts` (`SYSTEM_PROMPT`, `qwen/qwen3.8-27b` unless `DETECT_LLM_MODEL` is set, `temperature: 0`, `reasoning_effort: none`, `reasoning_format: hidden`, JSON mode).

Each row is graded on:

- JSON object with `signal`, `confidence`, `evidence`, `next_action`, and `reason`
- `signal` is `retention_risk`, `upsell_opportunity`, `lead_intent`, or `none`
- `confidence` is a number from 0 to 1
- `evidence` is non-empty when `signal` is not `none`
- `signal` matches the label in `dataset.yaml`

## Run

From `web/`:

```bash
npm run eval
```

The script loads Promptfoo with the TypeScript loader so the provider can import the live detector. `GROQ_API_KEY` comes from `web/.env` or the environment. Optional: `DETECT_LLM_MODEL` (default `qwen/qwen3.8-27b`).

The table prints pass/fail for `json_contract`, `evidence`, and `signal_accuracy`. A JSON report is written to `eval/signal-detect/results/latest.json` (gitignored). `npm run eval:view` opens the local Promptfoo UI.

Only customer turns are sent, in order, same as production. `expected_signal` stays in the test file and is not part of the model request.

## Add a case

Append a block to `dataset.yaml`:

```yaml
- description: Short name
  vars:
    customer_name: A. Example
    channel: chat
    expected_signal: retention_risk
    messages:
      - role: agent
        content: How can I help?
      - role: customer
        content: I am closing my account and moving my portfolio.
```

`expected_signal` must be one of `retention_risk`, `upsell_opportunity`, `lead_intent`, or `none`.
