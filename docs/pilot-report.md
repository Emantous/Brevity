# RTK pilot report

Issue: [#12](https://github.com/Emantous/Brevity/issues/12)

## Method

The pilot runs in a temporary directory and uses no repository source files.
It compares raw command output with RTK-filtered output locally.

The pilot records only aggregate character counts, estimated token counts,
reported reduction, status preservation, and task-detail checks. It does not
record command arguments, file contents, source code, paths, secrets, or
workspace identity.

Run the pilot with:

```bash
npm run pilot
```

## Acceptance threshold

A pilot passes only when:

- aggregate character-based estimated-token reduction is at least 50%;
- raw and filtered commands have the same success/failure status;
- task-critical details pass their case-specific checks.

The first pilot covers:

- `git status` with two untracked files;
- `git log --oneline -10` in an empty temporary repository.

This is a pilot of Git output only. Build, test, npm, pnpm, and yarn coverage
is intentionally kept as a follow-up until real project fixtures are available.

## Measured result

Pilot release: `dev-1.3.0-rc.642`, RTK binary `0.49.0`.

| Fixture | Raw characters | RTK characters | Reduction | Status preserved | Detail preserved |
| --- | ---: | ---: | ---: | --- | --- |
| `git status` | 246 | 86 | 65% | Yes | Yes |
| `git log --oneline -10` | 233 | 233 | 0% | Yes | Yes |
| `git diff -- history.txt` | 1527 | 1569 | -3% | Yes | Yes |

Aggregate reduction: 6%, below the 50% pilot threshold.
Status and task-critical details were preserved in all three cases.

## Decision

Do not expand the initial blanket rewrite based on this pilot. Keep the
conservative command allowlist, especially because the sampled `git diff` and
`git log` output were not reduced. Continue measuring a real build/test suite
before enabling additional package-manager or build commands broadly.

## Privacy

The pilot writes only aggregate JSON to standard output. It does not upload
telemetry or send command output to an external service.
