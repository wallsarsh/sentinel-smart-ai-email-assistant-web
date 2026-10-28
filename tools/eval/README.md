# AI evaluation

Scores the triage prompt (`triage.v1`) against a labelled set and prints each metric next to its target:
needs-reply precision and recall, importance macro-F1, action-item recall and schema-valid rate.

```
ANTHROPIC_API_KEY=... EVAL_MODEL=<model-id> npm run eval
```

| Variable                                                 | Meaning                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `EVAL_PROVIDER`                                          | `anthropic` (default), `openai`, `compatible` (schema target 0.95 instead of 0.99) |
| `EVAL_MODEL`                                             | required                                                                           |
| `EVAL_DATASET`                                           | JSONL, default `tools/eval/sample_dataset.jsonl`                                   |
| `EVAL_BASE_URL`                                          | other endpoint (public https only)                                                 |
| `EVAL_MAX_EMAILS`, `EVAL_BATCH`                          | set size, emails per request (default 8)                                           |
| `EVAL_TOKEN_BUDGET`                                      | stop starting requests after this many tokens (default 500000)                     |
| `EVAL_MAX_COST_USD` + `EVAL_PRICE_IN` / `EVAL_PRICE_OUT` | stop at an estimated spend; prices in USD per million tokens                       |

The key is read from `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Use a key with a spending limit. Exit code 1 when a
metric misses its target. The command refuses to run when `CI` is set (set `EVAL_ALLOW_CI=1` to override) and is not
part of `npm test` or the CI workflow.

Dataset line: `{"id","from","subject","body","expect":{"importance","needsReply","actions"}}`. The committed set is
synthetic. Real mail must not be committed; keep donor sets outside the repository.
