# ccmeter

Find out what your Claude Code sessions actually cost.

`ccmeter` reads the transcripts Claude Code already writes to `~/.claude/projects`
and reports your spend by project, model, session, and day. No API key, no network
calls, no dependencies — it only reads files that are already on your disk.

```
$ npx ccmeter

ccmeter — 53 sessions in ~/.claude/projects

Total cost   $910.95
Messages     3,750
Input        1.2B  (1.2B cached)
Output       3.1M
Cache hits   97.6% of input tokens

Project                                   cost      in    cached     out
--------------------------------------------------------------------------
Documents-Game-Development-Zeldonara   $344.92    5.2K    425.5M  992.4K
Documents-Kronos                       $328.83   11.6K    490.6M    1.0M
Documents-Astrea-Model                 $135.62   96.5K    164.0M  616.5K
```

## Install

```bash
npm install -g github:austinmerkariclaw/ccmeter
```

Or run it once without installing:

```bash
npx github:austinmerkariclaw/ccmeter
```

Node 18+. No dependencies to download — the install is the source and nothing else.

## Usage

```
ccmeter [options]

  --days N     only count activity from the last N days
  --budget N   exit 1 if total cost exceeds N dollars (CI spend gate)
  --top N      rows per table (default 10)
  --root DIR   transcript directory (default ~/.claude/projects)
  --json       machine-readable output
```

Exit codes: `0` ok, `1` over budget or no transcripts found, `2` bad usage.

`--json` emits the full breakdown, which is the hook for a dashboard or a monthly
report.

### On a subscription? Find out what your plan actually returns

Most Claude Code users are on Pro or Max, not API billing. `--plan` reframes the
same numbers as return on subscription:

```
$ ccmeter --plan pro

On a $20.00/mo plan, 30 days cost you $20.00
and returned $920.38 of API-equivalent usage — 46.0x.
```

Takes `pro`, `max5`, `max20`, or a monthly dollar amount. Defaults to a 30-day
window; override with `--days`. This is also the honest way to decide whether a
plan upgrade pays for itself — compare the multiplier before and after.

### Use it as a spend gate

`--budget` makes the tool usable unattended — fail the job when an agent run costs
more than you meant to spend:

```bash
ccmeter --days 1 --budget 25 || echo "agent spend exceeded today's budget"
```

The same check works in `--json` mode, which adds `budget` and `overBudget` fields
and sets the exit code identically.

## Where did it actually go?

Two questions nothing else answers, both from data already on your disk:

```
Subagents    $107.49 of $925.23 (12%) across 950 messages

Tool           calls      cost
------------------------------
Bash             503   $126.91
Edit             453    $92.02
Write            121    $34.06
```

Tool figures are **attribution by invocation**: the cost of the turns a tool was
called in, split across tools called in the same turn. The tool did not *cause*
that cost — accumulated context did — but it shows which tools ride along with
your expensive turns, which is what you need when trimming an agent loop.

## Why not just count the lines?

Claude Code writes the same assistant message to the transcript many times as it
streams, and every copy carries the same `usage` block. Summing every line that
has a `usage` field **overstates your spend by roughly 2.6×** — that is the real
measured factor across the 53 sessions above (9,732 usage lines, 3,751 actual
messages).

`ccmeter` deduplicates by message id, so the number it prints is the number you
are actually billed.

It also prices the four token classes separately, which most rough estimates
collapse into one: cache reads bill at 0.1× the input rate and cache writes at
1.25×. On a cache-heavy workload — 97.6% of input tokens above — treating cached
tokens as full-price input is off by an order of magnitude in the other direction.

## Accuracy notes

- Pricing lives in `pricing.json`. Edit it if your rates differ (enterprise
  agreements, a provider like Bedrock or Vertex, or a model released after this
  version).
- Cache writes are billed at the 5-minute-TTL rate. Transcripts do not record the
  TTL, so requests using the 1-hour TTL are under-counted by the same factor the
  API applies (2× instead of 1.25×).
- Models with no entry in `pricing.json` are excluded from the cost total and
  listed explicitly at the end of the report — never silently priced at zero.
- This measures **API-equivalent list cost**. If you use Claude Code on a
  subscription plan, treat it as the value of what you consumed, not an invoice.

## License

MIT
