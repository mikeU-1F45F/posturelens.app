---
name: commit
description: Intelligent commit assistant for any workflow - analyzes changes and creates logical commits with automatic grouping
license: MIT
compatibility: opencode
metadata:
  category: git
  usage: commit
  team-size: any
  auto-trigger-keywords:
    - commit
    - commit please
    - commit changes
    - commit this
    - commit now
    - stage commits
    - prepare commits
---

## What I do

I analyze uncommitted changes in a repository and help create logical, multi-stage commits following best practices:

1. **Inspect changes**: Run `git status`, `git diff`, and examine file contents
2. **Group logically**: Separate infrastructure/config changes from application code
3. **Generate commit messages**: Create conventional commit messages for each group
4. **Show preview**: Display exactly what will be committed with messages
5. **Ask for confirmation**: Prompt "Okay to commit?" with Yes/No options
6. **Execute on approval**: Run git commands automatically if you confirm
7. **Verify state**: Ensure build, lint, and tests pass before committing

## When to use me

Use this skill when you have multiple types of changes that should be separated into logical commits rather than one large commit. This is especially useful for:

- Mixed infrastructure and application changes
- Documentation updates combined with code changes
- Configuration changes that should be isolated
- Large feature work that can be staged

## How I work

### Analysis Phase

I start by examining:
```bash
git status --short          # What files changed
git diff --stat             # Change statistics
git diff <file>            # Detailed changes per file
```

### Grouping Strategy

I typically group changes into these categories (in order):

1. **Infrastructure & Tooling** (first commit)
   - Build configuration (package.json, tsconfig, etc.)
   - Dev tooling (linters, formatters, test setup)
   - CI/CD config
   - Documentation updates

2. **Application Code** (second+ commits)
   - Source code files
   - Tests
   - Static assets
   - Configuration specific to the app

3. **Cleanup** (final commit)
   - Remove temporary files
   - Update TODOs
   - Final verification

### Interactive Workflow

1. **Analysis**: I inspect your working directory and group changes logically
2. **Preview**: I show you exactly what will be committed:
   ```
   📋 Commit Preview
   
   Commit 1: build - Infrastructure Changes
   Files: package.json, tsconfig.json, biome.json
   Message: "build: add TypeScript and Biome configuration"
   
   Commit 2: feat - Application Code
   Files: src/main.ts, src/feature.ts
   Message: "feat: implement user authentication"
   
   Commit 3: docs - Documentation
   Files: README.md
   Message: "docs: update setup instructions"
   ```
3. **Confirmation**: I ask "Okay to commit? [Yes/No]"
4. **Action**:
   - **Yes**: I execute the git commands automatically and show progress
   - **No**: I provide the commands for you to run manually or adjust

### Example Session

```
You: I want to commit these changes

Skill: Let me analyze your working directory...

📊 Analysis Complete
Found 15 changed files across 3 categories

📋 Commit Preview

Commit 1: build - Project Foundation
├─ package.json
├─ tsconfig.json
├─ biome.json
└─ Message: "build: project foundation with Bun, TypeScript, Biome"

Commit 2: feat - Application Skeleton
├─ src/main.ts
├─ src/core/
├─ public/index.html
└─ Message: "feat: application skeleton with TypeScript source"

Okay to commit? [Yes/No]

You: Yes

Skill: Executing commits...
✅ Commit 1 created: build: project foundation with Bun, TypeScript, Biome
✅ Commit 2 created: feat: application skeleton with TypeScript source
🎉 All commits completed successfully!
```

### Verification Checklist

Before showing the preview, I verify:
- [ ] `bun run build` (or equivalent) passes
- [ ] `bun run lint` / `bun run check` passes
- [ ] Tests pass if applicable
- [ ] `bun run precommit` (if defined)

If verification fails, I show the errors and ask if you want to proceed anyway or fix them first.

### Usage Instructions

1. Make your changes as usual
2. When ready to commit, load this skill
3. I'll analyze and show a preview
4. Review the suggested commits
5. Answer "Yes" or "No" to proceed
6. If "Yes", I'll execute automatically
7. If "No", I'll provide manual commands

### Best Practices

1. **Order matters**: Commit infrastructure first, then dependent code
2. **Keep commits focused**: Each commit should have one clear purpose
3. **Verify between commits**: Automated verification runs before each commit
4. **Size appropriately**: Aim for commits that are reviewable
5. **Documentation**: Update docs in same commit as related code changes

### What happens on "No"

If you respond "No" to the confirmation prompt, I will:

1. Provide all git commands for manual execution
2. Explain how to adjust the commits if needed
3. Offer to re-analyze after you make changes
4. Never execute any git commands automatically

Example "No" response:
```
Okay to commit? No

I understand. Here are the commands to run manually:

# Commit 1 - Infrastructure
git add package.json tsconfig.json biome.json
git commit -m "build: project foundation"

# Commit 2 - Application Code
git add src/ public/
git commit -m "feat: add application skeleton"

# Push when ready
git push

Let me know if you'd like me to re-analyze after making changes!
```

### Safety Features

- **No automatic execution without confirmation**: I always ask first
- **Verification before preview**: Build/lint must pass (or you must override)
- **Idempotent operations**: Running the analysis multiple times is safe
- **Clear output**: You always see exactly what will happen

### Integration with OpenCode

This skill works seamlessly with OpenCode agents:
- Load me when you have changes ready to commit
- I'll use the `bash` tool to inspect your repository
- I can use the `question` tool to ask for confirmation
- I provide git commands the agent can execute via bash
- The agent can show me code changes and ask for strategy advice

## Notes

- I work with both staged and unstaged changes
- I respect your gitignore settings
- I detect and work with feature branches
- I support both conventional and custom commit message formats
- For monorepos, I can scope commits to specific packages
