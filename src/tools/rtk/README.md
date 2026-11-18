# RTK tool adapter

This directory contains the RTK-specific implementation only.

- `runtime.js` downloads, verifies, caches, starts, and reports RTK.
- RTK is registered as a Brevity tool and may be combined with future tools.
- RTK does not define the extension-wide enable, disable, status, or metrics
  lifecycle.

Future implementations should follow this directory pattern:

```text
src/tools/<tool-name>/
  index.js
  implementation files
```
