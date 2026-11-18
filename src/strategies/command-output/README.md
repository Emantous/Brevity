# Command-output reduction strategy

This strategy reduces token-heavy terminal command output before Copilot uses
it. It owns command eligibility, hook response validation, and the integration
boundary between Brevity and an underlying compression tool.

The initial implementation uses the registered RTK tool. Other tools can be
added here or in a dedicated strategy when they provide the same contract.
