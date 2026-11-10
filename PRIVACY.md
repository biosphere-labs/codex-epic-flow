# Privacy

Epic Flow for Codex is a local plugin by Biosphere Labs.
Last updated 2026-11-10.

The package has no hosted server, telemetry, analytics, account, or credentials
of its own. Its queue adapter runs locally and does not call a model API.

Through Codex’s tools it reads repository files and git history, writes records
under `.epic-flow/`, works on feature branches in `.worktrees/`, and runs project
checks, git commands and the bundled dependence slicer. It can read core count
and load to estimate parallel build capacity.

Prompts, selected repository content and command output are processed by Codex
under the terms and data controls applicable to your OpenAI account. Local
execution does not mean that model inputs stay on your machine.

The workflow can fetch from your git remote, research a reference product named
in a brief, and push or open a PR when authorized in Delivery. Those operations
use the corresponding service and Codex’s permissions. The plugin itself sends
no telemetry to Biosphere Labs.

Records persist as files in the target repository. The scheduler queue persists
only for the lifetime of its Node REPL session.

Contact: <https://github.com/biosphere-labs/codex-epic-flow/issues>.
