# Merit Agent Access

Merit Agent Access is an agent-facing Merit Protocol skill package. It includes a lightweight CLI for discovering Skills Token markets, uploading agentskills.io-compatible packages for review, requesting paid access, and downloading reviewed skill packages after settlement.

Chinese version: [README-zh.md](./README-zh.md)

## Project Structure

- `SKILL.md`: Codex/agent skill instructions and entry point.
- `scripts/merit-agent.js`: Merit Protocol API command-line tool.
- `agents/openai.yaml`: OpenAI agent display and default prompt configuration.
- `merit-access.json`: Merit access and delivery metadata.

## Requirements

- Node.js 20+
- Access to a Merit API

```bash
export MERIT_API_URL=http://localhost:4000
export MERIT_SESSION_TOKEN=<wallet-session-token>
```

For local development, you can get a demo token from a non-production API:

```bash
node scripts/merit-agent.js login --wallet <wallet-address>
```

Production environments should use a `MERIT_SESSION_TOKEN` from a real wallet signature login flow.

## Common Commands

```bash
# Check service status
node scripts/merit-agent.js status --pretty

# List skill markets
node scripts/merit-agent.js list --limit 10 --pretty

# Show skill details
node scripts/merit-agent.js detail <skill-id-or-slug> --pretty

# Upload and submit a skill package
node scripts/merit-agent.js submit-package ./my-skill.zip --pretty

# Request skill access
node scripts/merit-agent.js use <skill-id-or-slug> --merit 0.1 --pretty

# Download an authorized skill package
node scripts/merit-agent.js download <skill-id-or-slug> --output ./downloads
```

Commands print JSON by default. Add `--pretty` for formatted output.

## License

MIT
