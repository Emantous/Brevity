# Release and rollback policy

## Staged rollout

The managed RTK runtime is controlled by `brevity.enabled`, defaulting to
true. Release in stages:

Tagged releases run the repository release workflow. The workflow installs
locked dependencies, runs lint and unit tests, builds the VSIX, checks its
contents, generates a SHA-256 checksum, and attaches both files to the GitHub
release. Release in stages:

Operational rollout uses the local `brevity.rolloutStage` label:
`preview`, `staged`, or `general`. If a release must be stopped immediately,
set `brevity.killSwitch` to true or run **Brevity: Emergency Disable**.
This disables rewriting and removes Brevity-owned hook entries without
removing unrelated Copilot configuration. Clear the kill switch before using
**Brevity: Enable** again. Release in stages:

1. Run the combined test pipeline and package checks.
2. Publish the extension update.
3. Monitor runtime setup, checksum, hook, timeout, and VSIX failures.
4. If broad failures appear, advise users to disable Brevity or publish a patch.

VS Code settings survive extension upgrades and downgrades. Cached runtime
entries are tagged with an RTK release and executable checksum.

## Pinned RTK updates

Each RTK upgrade requires a separate extension release. Document the release
tag, binary version, platform assets, immutable SHA-256 digests, license
review, hook compatibility, and test evidence.

An update must preserve existing settings and unrelated Copilot hooks.

## Emergency bypass

- Run **Brevity: Disable** to stop automatic setup.
- Run **Brevity: Uninstall** to remove cached files.
- Set `brevity.enabled` to false.
- Run `rtk bypass <command>` for raw output.

## Rollback criteria

Unpublish or roll back if archives fail integrity checks broadly, hooks modify
unrelated configuration, command rewriting changes destructive intent or exit
status, setup blocks normal VS Code use, or licensing/privacy obligations cannot
be met.
