# Wheat Concepts

This guide explains the core ideas behind wheat. If you've run `npx @grainulation/wheat init` and are wondering "what does all this mean?" — start here.

## The mental model

If you've used CI/CD, you already understand wheat. The analogy:

| You know this  | Wheat equivalent                                      |
| -------------- | ----------------------------------------------------- |
| Test assertion | Claim (typed finding about the decision space)        |
| Test suite     | `claims.json` (all assertions for this investigation) |
| CI pipeline    | The compiler (7-pass validation)                      |
| Build artifact | Decision brief, presentation, handoff doc             |
| Test coverage  | Evidence tier (how well-verified each assertion is)   |
| Failing test   | Unresolved conflict (contradicting assertions)        |
| Green build    | Clean compilation — safe to ship                      |

Traditional planning tools (Notion docs, ADRs, tools like Obra) generate a big plan upfront, then you execute. That's waterfall planning — same problem as writing all your code then testing at the end. Wheat validates continuously: every finding is checked as it comes in, conflicts are caught immediately, and the compiler blocks output if your evidence doesn't hold up.

## Claims (typed assertions)

A claim is a typed assertion about the decision space. Every time you discover something — a hard constraint, a risk, a recommendation — wheat records it as a claim in `claims.json`.

Think of claim types as assertion categories:

- **`constraint`** — a type constraint, non-negotiable ("must support Postgres 14+")
- **`factual`** — a unit test, verifiable statement ("the API returns paginated results")
- **`estimate`** — a benchmark, a projection or range ("migration will take 2-4 weeks")
- **`risk`** — an edge case, a potential failure mode ("connection pooling may bottleneck at 500 concurrent users")
- **`recommendation`** — the function under test, a proposed course of action ("use pgBouncer for connection management")
- **`feedback`** — external input, stakeholder direction ("the VP wants this done by Q3")

Each claim also has:

- **ID** — a prefix + number (e.g., `r003`). The prefix tells you which phase created it.
- **Evidence tier** — how well-verified it is (see below)
- **Status** — `active`, `challenged`, `superseded`, or `retracted`

You never edit `claims.json` by hand. Slash commands create and update claims automatically.

## Sprints (not Agile sprints)

A wheat "sprint" is closer to a build than a Scrum sprint. It's a single investigation: one question, a set of assertions, and a compiled output. It takes 15 minutes to an hour, not two weeks. Think `make`, not Jira.

## Phases

A wheat sprint moves through phases. Each phase has commands that produce claims with matching ID prefixes:

| Phase         | What happens                                | Commands                         | Claim prefix                           |
| ------------- | ------------------------------------------- | -------------------------------- | -------------------------------------- |
| **Define**    | Frame the question, set constraints         | `/init`                          | `d###`                                 |
| **Research**  | Gather evidence, explore the problem space  | `/research`, `/witness`          | `r###`, `w###`                         |
| **Prototype** | Build something testable, validate findings | `/prototype`                     | `p###`                                 |
| **Evaluate**  | Challenge assumptions, find blind spots     | `/challenge`, `/blind-spot`      | `x###`                                 |
| **Feedback**  | Incorporate stakeholder input, recalibrate  | `/feedback`, `/calibrate`        | `f###`, `cal###`                       |
| **Output**    | Compile the decision document               | `/brief`, `/present`, `/handoff` | (consumes claims, doesn't create them) |

Phases are not strictly sequential. You can jump back to research after a prototype reveals gaps, or challenge a claim at any point. The claim IDs tell you where each finding came from.

## Evidence Tiers (test coverage for research)

Not all evidence is equal. Wheat grades every claim on a five-tier scale — think of it like test coverage for your assertions:

| Tier         | Meaning                                  | Analogy               | Example                                                    |
| ------------ | ---------------------------------------- | --------------------- | ---------------------------------------------------------- |
| `stated`     | Someone said it, no verification         | Untested code         | "The CTO mentioned we need HIPAA compliance"               |
| `web`        | Found online, not independently verified | Manual QA             | "Stack Overflow says this library handles 10k connections" |
| `documented` | In source code, official docs, or ADRs   | Unit tests            | "The Postgres docs say JSONB supports GIN indexes"         |
| `tested`     | Verified via prototype or benchmark      | Integration tests     | "Our prototype handled 500 concurrent connections in 43ms" |
| `production` | Measured from live production systems    | Battle-tested in prod | "Our APM shows p99 latency of 120ms under real traffic"    |

The compiler uses evidence tiers to warn you. A recommendation backed only by `stated` evidence gets flagged — like shipping code with 0% coverage. You don't have to fix every warning, but you have to see them.

## The Compiler

The compiler is what makes wheat more than a note-taking tool. Run it with:

```bash
npx @grainulation/wheat compile --summary
```

It reads `claims.json` and runs a multi-pass validation pipeline:

1. **Parse** — validates claim structure and types
2. **Link** — resolves cross-references between claims
3. **Conflict detection** — finds claims that contradict each other
4. **Evidence audit** — flags weak or missing evidence
5. **Coverage check** — identifies topics with only one claim type
6. **Status resolution** — tracks challenged/superseded claims
7. **Emit** — produces `compilation.json` with a health report

The output is `compilation.json` — a validated, scored snapshot of your sprint. Every output artifact (`/brief`, `/present`, `/handoff`) reads from `compilation.json`, never directly from `claims.json`. This means you cannot generate a brief from broken or conflicting data.

If the compiler says "blocked" — you have unresolved conflicts that must be addressed with `/resolve` before shipping output.

## Guard Hooks

Wheat installs two optional safeguards:

**Git pre-commit hook** — runs before every `git commit`. If `claims.json` is malformed or has structural errors, the commit is rejected. This prevents corrupted sprint data from entering your repo history.

**Claude Code guard hook** — runs before AI-generated output commands. If the compilation is stale (claims changed since last compile) or blocked (unresolved conflicts), the guard prevents artifact generation. This ensures you never ship a brief built on outdated or contradictory evidence.

Both hooks can be removed. They exist because the riskiest moment in a research sprint is when you skip validation under time pressure.

## Slash Commands

Wheat provides 20 slash commands inside Claude Code. Each command follows a pattern: investigate, record claims, compile, and suggest what to do next. See [commands.md](commands.md) for the full reference.

## How It All Fits Together

```
You ask a question
    |
    v
/init creates the sprint (constraints, audience, done-criteria)
    |
    v
/research, /prototype, /witness --> claims accumulate in claims.json
    |
    v
/challenge, /blind-spot ----------> claims get stress-tested
    |
    v
wheat compile ---------------------> compilation.json (validated snapshot)
    |
    v
/brief, /present, /handoff -------> output artifacts (backed by evidence)
```

The key insight: claims are the intermediate representation. Just like a compiler turns source code into machine code through an IR, wheat turns messy research into defensible decisions through typed, evidence-graded assertions. The compiler is the CI pipeline that keeps you honest — you can't ship with failing assertions, same as you can't merge with failing tests.
