# Brevity development notes

Brevity is a small VS Code extension that connects Copilot's terminal hook to
the RTK command-output tool.

## Main flow

- `extension.js` installs the RTK runtime and workspace hook automatically.
- `src/core/hookManager.js` adds or removes Brevity's `PreToolUse` hook while
  preserving other workspace hooks.
- `src/core/hook.js` passes terminal command payloads to RTK and returns a valid
  rewrite response to Copilot. RTK, not Brevity, decides which commands it can
  translate.
- `src/tools/rtk/runtime.js` downloads and verifies the RTK executable.

Keep the path simple: do not add a second command allowlist, user settings,
status UI, metrics, or tool/strategy registries. If RTK can rewrite a command,
Brevity should let its response through; otherwise the original command runs.

Run `npm run lint`, `npm run test:unit`, and `npm test` when changing the hook
or runtime.
