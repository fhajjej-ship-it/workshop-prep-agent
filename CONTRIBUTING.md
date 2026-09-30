# Contributing

Bug reports and focused improvements are welcome. Include reproduction steps, expected/actual behavior, Node version and test/live mode. Use fictional materials. Never include keys, database URLs, cookies, personal documents or private run records.

## Development

Follow the [README quick start](README.md#quick-start-no-credentials-required). Use test mode and local storage. Keep credentials in an untracked `.env.local`; do not use the hosted demo or another person's database for tests.

Before opening a pull request:

1. Keep the change focused and explain the user-visible problem and resulting behavior.
2. Run affected tests, `npm run typecheck` and `npm run build -- --webpack` when code changes require them. Cover meaningful new failure cases.
3. Run `git diff --check` and review staged files for credentials and private data.
4. State what you verified and any limitations. Distinguish scripted tests from live model results.

Preserve source snapshots, version history, human-review wording and test/live labels. Discuss new dependencies or changes to data access before expanding the implementation.

Report security findings privately as described in [SECURITY.md](SECURITY.md).
