# Frequently Asked Questions

## Setup

### Do I need Node.js?

You need Node 20+ to run wheat. But wheat does not add any dependencies to your project — no `node_modules`, no entries in your `package.json`. It runs via `npx` as an external tool.

If your team doesn't use Node at all, you still need it to run wheat — there is no standalone binary. Install Node 20+ and use:

```bash
npx @grainulation/wheat
```

### Does wheat live inside my project?

No. Wheat creates sprint data files in your repo (like `claims.json` and `CLAUDE.md`), but the wheat framework itself is external. Think of it like `git` — you run `git init` in your project, but git itself is installed separately.

### Can I use wheat in a non-JavaScript project?

Yes. Wheat works in any repo — Scala, Python, Flutter, Rust, whatever. It doesn't read or modify your source code. It uses your repo as context (reading code, docs, configs) but all wheat data is separate.

### What files does wheat create in my repo?

```
claims.json          # Your evidence database
CLAUDE.md            # AI assistant configuration
.claude/commands/    # Slash command definitions
output/              # Compiled artifacts (briefs, presentations)
research/            # Topic explainers
prototypes/          # Working proof-of-concepts
evidence/            # Evaluation results
```

All of these can be gitignored if you prefer. Most teams commit `claims.json` and `CLAUDE.md` because the git history becomes the sprint event log. The compiler itself lives in the wheat package -- nothing is copied into your project.

## Data & Privacy

### Where does my data live?

Everything stays in your repo. Wheat has no server, no cloud storage, no telemetry. Claims, compilation results, and output artifacts are local files.

### Can I delete a sprint?

Remove the wheat files (`claims.json`, `CLAUDE.md`, `.claude/commands/`, `wheat-compiler.js`, `output/`) and it's gone. There's nothing to unlink or deregister.

### Do claims get sent anywhere?

No. Claims are processed locally by the compiler. When you use `/research` or `/witness`, Claude Code may search the web or read URLs — but that's Claude Code's behavior, not wheat's.

## Usage

### What's the difference between `/research` and just asking Claude a question?

`/research` creates a structured record. Instead of a chat message that disappears when you close the window, you get typed, evidence-graded claims that persist in `claims.json`. The compiler can validate them, other commands can reference them, and `/brief` can compile them into a decision document.

If you just want a quick answer, ask normally. If you want the finding to become part of your sprint's evidence base, use `/research`.

### When should I use `/challenge`?

When you're too comfortable with a finding. Challenge is adversarial by design — it tries to prove a claim wrong. Use it on:

- High-stakes recommendations (the claim you're about to base a migration on)
- Claims with weak evidence (`stated` or `web` tier)
- Claims that feel too convenient ("this solves everything with no downsides")

### What does "compilation blocked" mean?

The compiler found unresolved conflicts — two or more claims that contradict each other. You need to run `/resolve` to pick a winner or synthesize a resolution before you can generate output artifacts.

This is intentional. A brief built on contradictory evidence is worse than no brief at all.

### Can I edit claims.json by hand?

You can, but you shouldn't. Slash commands maintain claim structure, auto-commit with descriptive messages, and keep the compiler happy. Hand-editing risks malformed JSON, missing fields, or commits that don't follow the sprint log format.

If you need to retract or update a claim, use `/challenge` to formally supersede it.

### Can I run multiple sprints in one repo?

Not currently in a single directory — each sprint expects its own `claims.json`. But you can:

- Run sprints in subdirectories
- Use `/merge` to combine findings from separate sprints
- Archive a completed sprint and start a new one

### Can I use wheat without Claude Code?

Wheat is designed for Claude Code, but the claim format and compiler are standalone. You could manually add claims to `claims.json` and run `npx @grainulation/wheat compile` from the command line. You'd lose the slash commands and intent routing, but the evidence-tracking and compilation pipeline still work.

## Troubleshooting

### The pre-commit hook is rejecting my commits

The hook validates `claims.json` on every commit. If it's rejecting:

1. Run `npx @grainulation/wheat compile --summary` to see what's wrong
2. Fix the reported issues (usually malformed JSON or structural errors)
3. Try your commit again

To bypass temporarily: `git commit --no-verify` (but fix the issue before your next sprint command).

### Commands aren't showing up in Claude Code

Make sure `.claude/commands/` exists and contains the `.md` files. If you cloned the repo, you may need to run `npx @grainulation/wheat init` again to regenerate them.

### The compiler says "stale compilation"

This means claims changed since the last compile. Run `npx @grainulation/wheat compile` to refresh. Output commands (`/brief`, `/present`) do this automatically, but the guard hook may catch staleness on manual operations.
