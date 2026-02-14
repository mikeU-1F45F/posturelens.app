# Multi-Agent Orchestration Plan

**Status**: Draft  
**Date**: 2026-02-14  
**Approach**: Option C (Hybrid - Parallel for independent, Sequential for dependent)

---

## Overview

This document outlines the workflow for running multiple OpenCode agents simultaneously to work on independent features while maintaining sequential dependency handling.

## Human-Agent Workflow

### Phase 1: Human Orchestration (Backlog → Selected)

The human controls the board:
- Creates and refines GitHub Issues with detailed acceptance criteria
- Adds sub-issues for dependent tasks
- Moves items from **Backlog** → **Selected** when ready for agent pickup
- Reviews PRs and moves items from **In Review** → **Done**

### Phase 2: Agent Execution (Selected → In Progress → In Review)

Agents work autonomously:
1. **Claim**: Query board for unassigned items in "Selected" column
2. **Assign**: Immediately assign themselves to the issue
3. **Verify**: Re-query to confirm successful claim
4. **Worktree**: Create isolated git worktree for the feature
5. **Move**: Update project board status to "In Progress"
6. **Implement**: Work in isolation following AGENTS.md conventions
7. **PR**: Push branch and create Pull Request
8. **Handoff**: Move to "In Review" and notify human

## Board Columns

```
Backlog → Selected → In Progress → In Review → Done
   ↑_________↑           ↑              ↑         ↑
  Human only          Agent claims   Agent     Human
                      here           moves     moves
```

## Agent Claim Protocol

```bash
# 1. Query for available work
gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 10) {
          nodes {
            id
            content {
              ... on Issue {
                number
                title
                assignees(first: 1) { totalCount }
              }
            }
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { name } }
                }
              }
            }
          }
        }
      }
    }
  }'

# 2. Filter for: status="Selected" AND assignees.totalCount=0

# 3. Attempt claim (assign self)
gh api graphql -f query='
  mutation($issueId: ID!, $assigneeIds: [ID!]!) {
    addAssigneesToAssignable(input: {
      assignableId: $issueId,
      assigneeIds: $assigneeIds
    }) {
      assignable {
        ... on Issue { number assignees(first: 1) { nodes { login } } }
      }
    }
  }'

# 4. Verify claim succeeded
# 5. If failed, retry with next item after 1-second delay
```

## Worktree Naming Convention

```
~/Work/
├── posturelens.app/                              # Main repository
├── posturelens-agent-{timestamp}-{issue#}/        # Agent worktrees
├── posturelens-agent-20260214-120345-23/
└── posturelens-agent-20260214-120512-45/
```

## Agent Log Format

Agents must log with this format:

```
[AGENT-{timestamp}] HH:MM:SS Action description...
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 Found issue #23, attempting claim...
[AGENT-20260214-120345] 14:32:03 Claim verified, creating worktree...
[AGENT-20260214-120345] 14:32:05 Worktree ready at ~/Work/posturelens-agent-20260214-120345-23
[AGENT-20260214-120345] 14:32:06 Moving issue to "In Progress"...
[AGENT-20260214-120345] 14:33:15 Implementation complete, creating PR...
[AGENT-20260214-120345] 14:33:20 PR created: https://github.com/.../pull/47
[AGENT-20260214-120345] 14:33:21 Moving to "In Review", waiting for human review...
[AGENT-20260214-120345] 14:45:10 Human requested changes, implementing refinement...
[AGENT-20260214-120345] 14:48:22 Changes pushed, PR updated
[AGENT-20260214-120345] 14:55:03 PR merged! Worktree preserved for any follow-up...
```

## Cleanup Policy

**No auto-cleanup**. Worktrees remain active for PR refinement:

### PR Review & Refinement Workflow
1. Agent creates PR from worktree branch
2. Agent moves issue to "In Review"
3. Human reviews PR on GitHub
4. If changes requested:
   - Human comments on PR or tells agent directly
   - Agent makes changes in same worktree
   - Agent pushes additional commits to same branch
   - PR automatically updates
5. Human merges PR via GitHub UI when satisfied
6. Worktree remains available for:
   - Follow-up bug fixes
   - Post-merge refinements
   - Reference while working on related issues

### Manual Cleanup (Human-initiated)
When worktree is no longer needed:
```bash
cd ~/Work/posturelens.app
git worktree remove ../posturelens-agent-{id}-{issue#}
git push origin --delete feature/issue-{number}-{description}
```

- Worktrees persist after PR creation for potential follow-up
- Feature branches remain on remote until manually deleted
- Human decides when to clean up based on review needs

## Dependency Handling

Dependent features should be structured as sub-issues:

```
Issue #42: Epic - Alert System Redesign
  ├── Sub-issue #43: Create alert engine core (BLOCKS #44, #45)
  ├── Sub-issue #44: Add visual alert components (DEPENDS #43)
  └── Sub-issue #45: Implement audio alert system (DEPENDS #43)
```

Agent workflow for dependencies:
1. Work on blocking issue first
2. Create PR, move to "In Review"
3. Human merges blocking PR
4. Agent pulls latest main
5. Agent proceeds with dependent issue

## Worktree vs Branch Architecture

### Worktrees (Filesystem Isolation)
- Each worktree is a separate directory (`~/Work/posturelens-agent-{id}-{issue#}/`)
- Multiple worktrees can be open in different editor windows simultaneously
- Each runs its own dev server without conflicts
- Changes in worktree A don't affect worktree B until pushed/merged

### Branches (PR Boundaries)
- Each worktree is checked out to its own branch: `feature/issue-{number}-{description}`
- PRs are created from these branches to `main`
- Each PR is reviewed independently on GitHub
- After merge, branch is deleted, worktree persists for potential refinements

## Port Management

**Deterministic port assignment**: `3000 + issue number`

```bash
# Examples:
Issue #23  → Port 3023
Issue #45  → Port 3045
Issue #128 → Port 3128

# To start dev server in worktree:
PORT=3023 bun run dev
```

This ensures no port collisions between agents and is easy to remember.

## Communication Protocol

Agents communicate via:
1. **GitHub Issue comments** - Progress updates, blockers
2. **Project board status** - Visual state tracking
3. **PR descriptions** - Link to issue, summarize changes
4. **Terminal output** - Real-time logs for human monitoring

### Example Issue Comment

```markdown
## Progress Update

**Claimed by**: Agent-20260214-120345  
**Worktree**: `~/Work/posturelens-agent-20260214-120345-23`  
**Branch**: `feature/issue-23-alert-sounds`

### Completed
- [x] Created alert sound assets
- [x] Integrated with alert engine
- [x] Added volume controls

### Blocked
Need clarification on: Should alert sounds be user-configurable or hardcoded?

### Next Steps
Pending human review of PR #47
```

## Reusable Skills

See `.opencode/skills/` for standardized agent behaviors:
- `claim-issue/` - Query board, assign, verify
- `create-worktree/` - Set up isolated worktree
- `update-project-status/` - Move items between columns
- `handoff-to-human/` - Finalize and notify

## Quick Start for New Agents

```bash
# 1. Human spins up OpenCode instance in new terminal
# 2. Agent reads this document
# 3. Agent runs skill: claim-issue
# 4. Agent confirms claim in terminal (human waits for this log)
# 5. Human sees "In Progress" on board
# 6. Agent creates worktree and proceeds with implementation
# 7. Agent creates PR and notifies human with PR URL
# 8. Human reviews PR on GitHub
# 9. If changes needed: Human requests, agent refines in same worktree
# 10. Human merges PR, worktree stays alive for any follow-up
# 11. Human eventually cleans up worktree when done
```

### Human Wait Points

The human should wait for these log messages before proceeding:

**After step 3:**
```
[AGENT-xxx] HH:MM:SS Claim verified! Assigned to: AGENT-xxx
```
→ Human sees issue move to "In Progress" on board

**After step 7:**
```
[AGENT-xxx] HH:MM:SS PR created: https://github.com/.../pull/47
[AGENT-xxx] HH:MM:SS Moving to "In Review", waiting for human review...
```
→ Human clicks PR link to review

---

## Success Metrics

- [ ] Agents successfully claim issues without collisions
- [ ] All worktrees are isolated and don't conflict
- [ ] PRs link to issues correctly
- [ ] Project board accurately reflects work state
- [ ] Human can review work without confusion
- [ ] No lost work or overwritten changes
