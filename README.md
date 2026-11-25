# Brevity

Brevity lets RTK shorten terminal output returned to GitHub Copilot in VS Code.
It does not rewrite the text you type in chat. Before a terminal command runs,
Brevity passes its Copilot hook data to RTK. RTK rewrites commands it supports
and leaves the rest unchanged.

## Use

1. Install and enable Brevity in VS Code.
2. Open a workspace and start GitHub Copilot Chat.
3. Brevity installs RTK and its workspace hook automatically.

No commands or settings need to be configured. RTK decides which commands it
can translate. To see the unshortened output for one command, use RTK's
`rtk bypass <command>` form.

## Development

```bash
npm install
npm run lint
npm run test:unit
npm test
```

The RTK runtime is downloaded from its GitHub release and checked against a
pinned SHA-256 checksum before use. Runtime files are stored in VS Code's
extension storage. Brevity stores no command text or hook payloads.
