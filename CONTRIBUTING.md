# Contributing to Orson

Thanks for helping improve Orson. It is an early, local-first desktop app for
understanding what happens after publishing a Kafka event. Focus contributions
on making that debugging loop clearer, safer, and easier to reproduce.

## Development setup

Orson currently requires:

- Go 1.25+
- Node.js 20.19+ or 22.12+
- Docker
- Wails CLI v2.15.0

Install the JavaScript dependencies from the repository root:

```bash
npm install
npm --prefix frontend install
```

Install the matching Wails CLI if it is not already available:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
```

Start the local Kafka demo from the repository root:

```bash
docker compose -f demo/compose.yaml up --build
```

Then start Orson in another terminal:

```bash
wails dev
```

The demo broker is available to the host at `localhost:9092`. The demo
services, fixtures, and branch behavior are documented in
[`demo/README.md`](demo/README.md) and [`demo/EVENTS.md`](demo/EVENTS.md).

## Working on scenarios

Scenario files are human-readable YAML intended to be shared through Git. The
canonical bundled example is [`scenarios/order-flow.yaml`](scenarios/order-flow.yaml),
and the format is documented in [`docs/scenario-format.md`](docs/scenario-format.md).

Do not put credentials or captured run data in a scenario file. Keep payloads
representative and safe to commit. Imported and newly saved scenarios should
use the existing loader and serializer rather than introducing a second file
format.

## Branches and changes

Create a focused branch from `main`. The usual prefixes are:

- `feat/` for user-facing functionality
- `fix/` for bug fixes
- `docs/` for documentation-only changes
- `refactor/` for behavior-preserving cleanup

Keep unrelated formatting or generated-file changes out of the branch. For UI
changes, describe the user-visible behavior and include a screenshot or short
recording when it makes the change easier to review.

## Validation

Before opening a pull request, run the checks relevant to your change. The
full repository validation is:

```bash
go test ./...
go vet ./...
npm run check
npm run test:frontend
npm --prefix frontend run build
```

`npm run check` covers formatting, linting, TypeScript, and export checks. Go
changes should also remain `gofmt`-clean. If a check cannot be run locally,
explain that in the pull request and include the reason.

## Pull requests

Keep the pull request focused and use the repository template. Explain:

- what changed and why
- the user-facing behavior
- how it was tested
- screenshots for UI changes
- risks, follow-ups, or intentionally deferred work

Small pull requests are easier to review, but a larger change is fine when it
represents one coherent user workflow. Update the relevant documentation when
behavior, commands, or scenario format changes.

## Issues

Use the bug report form for reproducible failures and the feature request form
for proposed behavior. Include the Orson version or commit, operating system,
Kafka/demo setup, and the smallest useful reproduction. Remove secrets and
sensitive payload data from logs or screenshots before attaching them.
