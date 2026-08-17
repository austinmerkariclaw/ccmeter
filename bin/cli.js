#!/usr/bin/env node
'use strict';

const { analyze, defaultRoot } = require('../index.js');

function parseArgs(argv) {
  const opts = { top: 10, json: false, days: null, root: null, budget: null, plan: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--plan') opts.plan = argv[++i];
    else if (a === '--budget') opts.budget = Number(argv[++i]);
    else if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--top') opts.top = Number(argv[++i]);
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else {
      console.error(`ccmeter: unknown option "${a}"`);
      process.exit(2);
    }
  }
  return opts;
}

const HELP = `ccmeter — what your Claude Code sessions actually cost

Usage: ccmeter [options]

  --days N     only count activity from the last N days
  --plan P     compare against a subscription: pro, max5, max20, or a monthly
               dollar amount. Shows what your plan returned vs what it costs.
  --budget N   exit 1 if total cost exceeds N dollars (CI spend gate)
  --top N      rows per table (default 10)
  --root DIR   transcript directory (default ${defaultRoot()})
  --json       machine-readable output
  -h, --help   this message

Exit codes: 0 ok, 1 over budget or no transcripts found, 2 bad usage.
`;

const usd = (n) => '$' + n.toFixed(2);
const tok = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
  : String(n);

function table(title, map, top) {
  const rows = [...map.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, top);
  if (!rows.length) return;
  const width = Math.max(title.length, ...rows.map(([k]) => k.length));
  console.log('\n' + title.padEnd(width) + '      cost      in    cached     out');
  console.log('-'.repeat(width + 38));
  for (const [key, b] of rows) {
    console.log(
      key.padEnd(width) +
        usd(b.cost).padStart(10) +
        tok(b.input).padStart(8) +
        tok(b.cacheRead + b.cacheWrite).padStart(10) +
        tok(b.output).padStart(8)
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(HELP);

  for (const k of ['days', 'top', 'budget']) {
    if (opts[k] !== null && !(opts[k] > 0)) {
      console.error(`ccmeter: --${k} needs a positive number`);
      process.exit(2);
    }
  }

  const PLANS = { pro: 20, max5: 100, max20: 200 };
  let planPrice = null;
  if (opts.plan !== null) {
    planPrice = PLANS[String(opts.plan).toLowerCase()] ?? Number(opts.plan);
    if (!(planPrice > 0)) {
      console.error(`ccmeter: --plan takes ${Object.keys(PLANS).join(', ')}, or a monthly dollar amount`);
      process.exit(2);
    }
  }

  // A plan comparison is meaningless without a window; default it to a month.
  if (planPrice !== null && opts.days === null) opts.days = 30;

  const since = opts.days ? new Date(Date.now() - opts.days * 864e5) : null;
  const r = await analyze({ root: opts.root, since });

  if (!r.files) {
    console.error(`ccmeter: no transcripts found in ${r.root}`);
    process.exit(1);
  }

  const overBudget = opts.budget !== null && r.totals.cost > opts.budget;

  if (opts.json) {
    const obj = (m) => Object.fromEntries(m);
    console.log(
      JSON.stringify(
        {
          root: r.root,
          files: r.files,
          totals: r.totals,
          byModel: obj(r.byModel),
          byProject: obj(r.byProject),
          byDay: obj(r.byDay),
          unpriced: r.unpriced,
          budget: opts.budget,
          overBudget,
        },
        null,
        2
      )
    );
    return process.exit(overBudget ? 1 : 0);
  }

  const t = r.totals;
  const cached = t.cacheRead + t.cacheWrite;
  const totalIn = t.input + cached;

  console.log(`ccmeter — ${r.files} sessions in ${r.root}`);
  console.log(`\nTotal cost   ${usd(t.cost)}`);
  console.log(`Messages     ${t.messages.toLocaleString()}`);
  console.log(`Input        ${tok(totalIn)}  (${tok(cached)} cached)`);
  console.log(`Output       ${tok(t.output)}`);
  if (totalIn > 0) {
    console.log(`Cache hits   ${((t.cacheRead / totalIn) * 100).toFixed(1)}% of input tokens`);
  }

  if (planPrice !== null) {
    const share = planPrice * (opts.days / 30);
    console.log(
      `\nOn a ${usd(planPrice)}/mo plan, ${opts.days} days cost you ${usd(share)}\n` +
        `and returned ${usd(t.cost)} of API-equivalent usage — ${(t.cost / share).toFixed(1)}x.`
    );
  }

  table('Project', r.byProject, opts.top);
  table('Model', r.byModel, opts.top);
  table('Session', r.bySession, opts.top);

  const days = [...r.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-opts.top);
  if (days.length) {
    console.log('\nDay              cost');
    console.log('---------------------');
    for (const [d, b] of days) console.log(d.padEnd(12) + usd(b.cost).padStart(9));
  }

  if (r.unpriced.length) {
    console.log(`\nNote: no pricing for ${r.unpriced.join(', ')} — excluded from cost.`);
  }

  if (opts.budget !== null) {
    const verdict = overBudget ? 'OVER BUDGET' : 'within budget';
    console.log(`\n${verdict}: ${usd(r.totals.cost)} of ${usd(opts.budget)}`);
    if (overBudget) process.exit(1);
  }
}

main().catch((e) => {
  console.error('ccmeter:', e.message);
  process.exit(1);
});
