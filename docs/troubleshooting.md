# Troubleshooting

## Status bar states

| State | Meaning | Recovery |
| --- | --- | --- |
| Ready | RTK and the Copilot hook are installed | No action is required |
| Setup needed | RTK could not be downloaded or verified | Run **Brevity: Retry Tools** |
| No hook | RTK is ready but no project hook is active | Open a workspace, then retry setup |
| Off | Brevity is disabled | Enable `brevity.enabled` and retry setup |

## RTK download fails

Run **Brevity: Show Status**, then open the **Brevity RTK** output
channel. Check internet access and HTTPS filtering. Repeat
**Brevity: Retry Tools**.

If setup does not complete, Brevity leaves commands unchanged. No manual RTK
installation is required.

## Checksum mismatch

A checksum mismatch means the downloaded archive did not match the pinned
RTK digest embedded in Brevity. Brevity does not execute that archive.

Retry once with internet access restored. If it repeats, leave Brevity
disabled or run the uninstall command until the extension is updated.

## Hook was not created

Confirm that a workspace folder is open. Brevity creates:

```text
.github/hooks/rtk-rewrite.json
```

inside each open workspace folder.

If the file is malformed or permissions prevent writing, Brevity preserves
unrelated hook entries and reports the failure in the output channel.

## Copilot does not compress a command

First verify the command is in the supported allowlist and not excluded.
Unknown commands, heredocs, shell operators, redirections, `sudo`, and explicit
`rtk bypass` commands intentionally pass through unchanged.

Also check whether the Copilot session was started before the hook was
installed. Restart or reopen the Copilot session after setup.

## Raw output is required

Run:

```bash
rtk bypass <command>
```

For example:

```bash
rtk bypass git status
```

This asks RTK to execute the command without filtering. A raw terminal result
does not prove Brevity's hook is broken; it confirms the same command outside
the compression path.

## Remote, SSH, container, or WSL problems

Open the workspace in the remote context and run setup there. The runtime is
stored for the VS Code context where the Copilot terminal executes.

If a remote context is unsupported, commands pass through unchanged rather
than using a local binary that is not visible to the remote process.

## Disable or fully uninstall

- **Brevity: Disable** disables the setting and
  removes Brevity's hook entries.
- **Brevity: Uninstall** also removes the extension-managed
  runtime cache.

The uninstall commands do not delete unrelated Copilot hooks or workspace files.
