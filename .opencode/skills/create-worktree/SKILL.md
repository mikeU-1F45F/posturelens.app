---
name: create-worktree
description: Create an isolated git worktree for working on a specific issue, set up the development environment, and prepare for implementation. Use immediately after claiming an issue.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Create Worktree Skill

## Purpose
Create an isolated git worktree for working on a specific issue, set up the development environment, and prepare for implementation.

## Prerequisites
- In main repository directory
- Issue claimed and AGENT_ID set
- `bun` installed

## Usage

```bash
# From main repo, after claiming issue
/opencode/skill/create-worktree --issue 23 --title "add-audio-alerts"

# Full example with all params
/opencode/skill/create-worktree \
  --issue 23 \
  --title "add-audio-alerts" \
  --base-branch main \
  --worktree-prefix "~/Work/posturelens-agent-"
```

## Output

On success:
```
[AGENT-20260214-120345] 14:32:10 Creating worktree for issue #23...
[AGENT-20260214-120345] 14:32:10 Branch name: feature/issue-23-add-audio-alerts
[AGENT-20260214-120345] 14:32:10 Worktree path: ~/Work/posturelens-agent-20260214-120345-23
[AGENT-20260214-120345] 14:32:11 Creating worktree from main...
[AGENT-20260214-120345] 14:32:12 Worktree created successfully
[AGENT-20260214-120345] 14:32:12 Installing dependencies with bun...
[AGENT-20260214-120345] 14:32:15 Dependencies installed (26 packages)
[AGENT-20260214-120345] 14:32:15 Worktree ready!

WORKTREE_PATH=/home/al/Work/posturelens-agent-20260214-120345-23
BRANCH_NAME=feature/issue-23-add-audio-alerts
ISSUE_NUMBER=23
```

On failure:
```
[AGENT-20260214-120345] 14:32:10 Creating worktree for issue #23...
[AGENT-20260214-120345] 14:32:10 ERROR: Worktree already exists at ~/Work/posturelens-agent-20260214-120345-23
[AGENT-20260214-120345] 14:32:10 Hint: Remove existing worktree or use --force

EXIT_CODE=1
```

## Algorithm

1. **Validate** - Check we're in git repo, issue number provided
2. **Generate names**:
   - Worktree directory: `{prefix}-{agent-id}-{issue#}`
   - Branch name: `feature/issue-{number}-{slug}`
3. **Pull latest** - `git pull origin main` in main repo
4. **Create worktree** - `git worktree add -b {branch} {path} main`
5. **Install deps** - `cd {path} && bun install`
6. **Verify** - Check critical files exist (package.json, src/, etc.)
7. **Report** - Output paths and success message

## Directory Structure Created

```
~/Work/
├── posturelens.app/                              # Main repo (unchanged)
└── posturelens-agent-20260214-120345-23/          # New worktree
    ├── .git/                                      # Points to main .git
    ├── src/                                       # Source code
    ├── docs/                                      # Documentation
    ├── public/                                    # Static assets
    ├── node_modules/                              # Fresh install
    ├── package.json                               # Copied from main
    └── bun.lock                                   # Copied from main
```

## Port Configuration

The skill detects if dev server port needs adjustment:

```
[AGENT-20260214-120345] 14:32:15 Checking for port conflicts...
[AGENT-20260214-120345] 14:32:15 Port 3000 in use by main repo
[AGENT-20260214-120345] 14:32:15 Using port 3001 for this worktree
[AGENT-20260214-120345] 14:32:15 To start dev server: PORT=3001 bun run dev
```

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--issue` | Yes | - | Issue number to work on |
| `--title` | No | "feature" | Short descriptor for branch name |
| `--base-branch` | No | "main" | Branch to base worktree on |
| `--worktree-prefix` | No | "~/Work/posturelens-agent-" | Path prefix for worktree |
| `--force` | No | false | Remove existing worktree if exists |

## Error Handling

| Error | Action | Exit Code |
|-------|--------|-----------|
| Not in git repo | Log error | 1 |
| Worktree already exists | Log error, suggest --force | 2 |
| bun install fails | Log error, keep worktree for debugging | 3 |
| Branch already exists | Log error, suggest different title | 4 |

## Cleanup

Worktrees are NOT auto-deleted. Manual cleanup:

```bash
# After PR is merged
cd ~/Work/posturelens.app
git worktree remove ../posturelens-agent-20260214-120345-23
git branch -D feature/issue-23-add-audio-alerts
```

## Dependencies

- `git worktree` command
- `bun` for package management
- `gh` for GitHub CLI (optional, for verification)

## Integration

Typical workflow:
```bash
# 1. Claim issue
/opencode/skill/claim-issue

# 2. Create worktree (uses ISSUE_NUMBER from claim)
/opencode/skill/create-worktree --issue $ISSUE_NUMBER --title "add-audio"

# 3. Move to In Progress
/opencode/skill/update-project-status --item $PROJECT_ITEM_ID --status "In Progress"

# 4. Start working
cd $WORKTREE_PATH
bun run dev
```

## Notes

- Each worktree gets fresh `node_modules/` (Bun's global cache makes this fast)
- Worktrees share the same git history and remotes
- Can run multiple dev servers simultaneously on different ports
- Changes in worktree don't affect main repo until pushed
