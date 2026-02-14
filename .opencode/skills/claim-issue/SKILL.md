# Claim Issue Skill

## Purpose
Query the GitHub Project board for available work in the "Selected" column, assign the issue to the agent, and verify the claim succeeded.

## Prerequisites
- GitHub CLI (`gh`) authenticated
- `AGENT_ID` environment variable set (e.g., `AGENT-20260214-120345`)
- Project ID known (stored in `.opencode/config.json` or passed as param)

## Usage

```bash
# Interactive mode
/opencode/skill/claim-issue

# With explicit project
/opencode/skill/claim-issue --project-id PVT_kwDOANN5s84ACbL0 --owner "@me" --project-number 3
```

## Output

On success:
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 Found 3 items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Attempting to claim issue #23...
[AGENT-20260214-120345] 14:32:03 Claim verified! Assigned to: AGENT-20260214-120345
[AGENT-20260214-120345] 14:32:03 Issue: "Add audio alert system"
[AGENT-20260214-120345] 14:32:03 Ready to create worktree for issue #23

ISSUE_NUMBER=23
ISSUE_TITLE="Add audio alert system"
ISSUE_ID=I_kwDOANN5s84ACbL1
PROJECT_ITEM_ID=PVTI_lADOANN5s84ACbL0zgBVd94
```

On failure (no available work):
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 No unassigned items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Hint: Ask human to triage Backlog → Selected

EXIT_CODE=1
```

On race condition (another agent claimed first):
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 Found 3 items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Attempting to claim issue #23...
[AGENT-20260214-120345] 14:32:03 Claim failed - already assigned to AGENT-20260214-120512
[AGENT-20260214-120345] 14:32:03 Retrying with next item after 1s delay...
[AGENT-20260214-120345] 14:32:04 Attempting to claim issue #24...
[AGENT-20260214-120345] 14:32:05 Claim verified! Assigned to: AGENT-20260214-120345

ISSUE_NUMBER=24
ISSUE_TITLE="Update alert thresholds"
ISSUE_ID=I_kwDOANN5s84ACbL2
PROJECT_ITEM_ID=PVTI_lADOANN5s84ACbL0zgBVd95
```

## Algorithm

1. **Query** - Get all items in project
2. **Filter** - Find items where:
   - Status field = "Selected"
   - No assignees (assignees.totalCount = 0)
3. **Sort** - By issue number (ascending) for deterministic ordering
4. **Attempt Claim** - For first item:
   - Assign AGENT_ID to issue
   - Wait 500ms for propagation
5. **Verify** - Re-query the specific issue:
   - If assignee matches AGENT_ID → success
   - If assignee differs → race condition, retry with next item
   - If still unassigned → claim failed, retry
6. **Retry** - Up to 3 attempts with 1-second delays between

## Environment Variables

- `AGENT_ID` - Unique identifier for this agent instance
- `GITHUB_TOKEN` - (Optional) Override default gh auth

## Files

- `claim.sh` - Main implementation script
- `query.graphql` - GraphQL query for fetching items
- `assign.graphql` - GraphQL mutation for assigning issue

## Integration

After successful claim, agent should:
1. Create worktree: `git worktree add -b feature/issue-${ISSUE_NUMBER}-...`
2. Move to "In Progress": Update project board status
3. Start implementation

## Error Handling

| Error | Action | Exit Code |
|-------|--------|-----------|
| No items in Selected | Log, suggest human triage | 1 |
| All items assigned | Log, suggest waiting | 1 |
| Race condition (all retries fail) | Log collision, exit | 2 |
| GraphQL error | Log error details | 3 |
| Missing AGENT_ID | Log requirement | 4 |

## Race Condition Mitigation

The skill implements optimistic locking:
- 500ms delay after assignment before verification
- Up to 3 retry attempts
- 1-second delay between retries
- Deterministic ordering (by issue number) reduces collisions

## Testing

Test scenarios:
1. Empty Selected column → should exit 1
2. Single unassigned item → should claim successfully
3. Multiple unassigned items → should claim first
4. Simultaneous agents → should handle via retries
5. Already assigned item → should skip and try next
