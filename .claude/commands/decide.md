---
description: Record a project decision (creates an ADR and syncs the blueprint)
argument-hint: <decision in one sentence>
---

The user has made or proposed this decision: "$ARGUMENTS".

1. Invoke the `architecture-reviewer` subagent on it and summarise its verdict.
2. If the user confirms, use the `adr` skill to record it, then the `blueprint-sync` skill to update every affected document.
3. Report the ADR number and the files changed.
