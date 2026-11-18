# Third-party notices

## RTK

Brevity uses RTK as an optional command-output compression engine.

- Project: [RTK](https://github.com/rtk-ai/rtk)
- Copyright: 2026 RTK AI Labs
- Initial edition: RTK OSS
- Licence: Apache License 2.0
- Source: https://github.com/rtk-ai/rtk

RTK OSS includes the hook core and command filters without the
`rtk-engine` component. Brevity does not distribute RTK OSS in the extension
package by default; it downloads a pinned, checksum-verifiable release into
extension-owned storage at runtime. The downloaded archive contains RTK's
Apache 2.0 license.

The full RTK binary also contains `rtk-engine`, which RTK licenses under the
Business Source License 1.1 with a production-use grant for use as part of
the RTK binary. Brevity must not adopt that edition or describe RTK as wholly
Apache-2.0 without a separate legal/licensing decision.

Neither this notice nor Brevity's source modifies RTK. Any future copy or
modification of RTK source must preserve its copyright and licence notices.

## Licence text

The complete RTK OSS license is stored in
[`third-party-licenses/RTK-LICENSE.txt`](third-party-licenses/RTK-LICENSE.txt).
