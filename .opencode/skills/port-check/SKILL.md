---
name: port-check
description: Verify dev server port availability and calculate deterministic port for worktree. Use before starting bun run dev to avoid port collisions.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Port Check Skill

## Purpose
Verify dev server port availability and calculate deterministic port for worktree.

## Prerequisites
- Issue number known
- `AGENT_ID` environment variable set

## Usage

```bash
# Check and report port for issue #23
/opencode/skill/port-check --issue 23

# Full check with alternatives
/opencode/skill/port-check --issue 23 --check-alternatives
```

## Implementation

```bash
# Calculate port: 3000 + issue number
PORT=$((3000 + ISSUE_NUMBER))

# Check if port is in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port $PORT is in use"
  if [[ "$CHECK_ALTERNATIVES" == "true" ]]; then
    # Find next available port
    for alt_port in $((PORT+1)) $((PORT+2)) $((PORT+3)); do
      if ! lsof -Pi :$alt_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "Alternative port available: $alt_port"
        break
      fi
    done
  fi
  exit 1
else
  echo "Port $PORT is available"
  exit 0
fi
```

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--issue` | Yes | - | Issue number |
| `--check-alternatives` | No | false | Find next available if taken |
| `--base-port` | No | 3000 | Starting port number |

## Output

On success:
```
[AGENT-xxx] HH:MM:SS Calculated port for issue #23: 3023
[AGENT-xxx] HH:MM:SS Port 3023 is available
[AGENT-xxx] HH:MM:SS To start dev server: PORT=3023 bun run dev
```

On failure (port in use):
```
[AGENT-xxx] HH:MM:SS Calculated port for issue #23: 3023
[AGENT-xxx] HH:MM:SS WARNING: Port 3023 is in use
[AGENT-xxx] HH:MM:SS Alternative available: PORT=3024 bun run dev
```

## Exit Codes

- 0: Port available
- 1: Port in use, no alternative found
- 2: Invalid issue number
