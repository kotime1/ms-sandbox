// Which practice questions have a lab, and which do not. Reads questions/questions.json and each lab's `sourceQuestions`.
//
//   node scripts/coverage.mjs            per-lab and per-set summary, then the questions with no lab grouped by topic
//   node scripts/coverage.mjs --check    exit 1 if a question has no lab and no BACKLOG entry (used by a test)
//
// A question that repeats an earlier one is reported once, under its earliest set.

import { fileURLToPath } from 'node:url';
import { LABS } from '../server/labs/index.js';
import { loadQuestions, setKeys } from '../server/knowledge/questions.js';

const SETS = setKeys();
const short = (k) => `S${k.replace('set', '')}`;

// Backlog: the topic of every question that has no lab yet. Hand-written because it is a judgement about the exam, not about code.
// Keyed by "set:number" of the question's FIRST appearance. build() FAILS if an uncovered question has no entry here, so the backlog can
// never silently hold a mislabelled or missing item. Delete an entry when a lab covers the question.
const T_CONNECT = 'Data connectors: AMA, Azure Arc, DCRs, Azure Policy, regions';
const T_TI = 'Threat intelligence ingestion';
const T_PURVIEW = 'Purview: insider risk, DLP, audit, eDiscovery';
const T_MDI = 'Defender for Identity and identity remediation';
const T_XDR = 'Defender XDR portal: disruption, email notifications, incident aggregation';
const T_CLOUD = 'Defender for Cloud: alerts and automation';
export const BACKLOG = {
  'set1:2': 'Defender for Endpoint: supported platforms (recall)',
  'set1:14': T_CONNECT, 'set1:15': T_TI, 'set1:21': 'Analytics: MITRE ATT&CK coverage',
  'set1:22': T_PURVIEW, 'set1:23': T_PURVIEW, 'set1:26': T_XDR, 'set1:27': T_CLOUD, 'set1:28': T_MDI, 'set1:29': T_PURVIEW,
  'set1:37': T_PURVIEW, 'set1:46': 'Data lake: KQL jobs',
  'set2:14': T_CONNECT, 'set2:22': T_PURVIEW,
  'set2:26': 'Security Copilot', 'set2:35': T_PURVIEW,
  'set2:45': 'Sentinel graph and entity resolution',
  'set3:35': 'ASIM parsers',
  'set3:48': 'Sentinel graph and entity resolution',
  'set4:5': 'Automation rules: Incident provider condition (docs: Sentinel or Defender XDR, independent of connectors)', 'set4:6': 'Playbooks: create the Logic App first',
  'set5:13': T_TI,
  'set6:6': 'Defender for Endpoint: deception rules',
  'set6:30': 'Defender XDR portal: entity pages from incident evidence',
  'set6:37': T_PURVIEW,
};

/** Everything the report needs, computed from the questions and the labs. */
export function analyse() {
  const questions = loadQuestions().questions;
  const labsFor = {};
  for (const l of LABS) for (const k of SETS) for (const n of l.sourceQuestions[k] ?? []) (labsFor[`${k}:${n}`] ??= []).push(l.id);

  const perSet = Object.fromEntries(SETS.map((k) => [k, { total: 0, covered: 0 }]));
  const uncovered = new Map(); // topic -> ["S1:2", ...]
  const problems = [];
  for (const q of questions) {
    const first = `set${q.appearances[0].set.slice(1)}:${q.appearances[0].n}`;
    for (const a of q.appearances) {
      const key = `set${a.set.slice(1)}:${a.n}`;
      perSet[`set${a.set.slice(1)}`].total++;
      if (labsFor[key]) perSet[`set${a.set.slice(1)}`].covered++;
    }
    const covered = q.appearances.some((a) => labsFor[`set${a.set.slice(1)}:${a.n}`]);
    if (covered) continue;
    const topic = BACKLOG[first];
    if (!topic) { problems.push(`Question ${first} has no lab and no entry in BACKLOG (scripts/coverage.mjs). Add a lab or a topic.`); continue; }
    if (!uncovered.has(topic)) uncovered.set(topic, []);
    uncovered.get(topic).push(`${short(first.split(':')[0])}:${first.split(':')[1]}`);
  }
  // A backlog entry for a question that now has a lab (or that does not exist) is stale and hides progress.
  const firsts = new Set(questions.map((q) => `set${q.appearances[0].set.slice(1)}:${q.appearances[0].n}`));
  for (const key of Object.keys(BACKLOG)) {
    const q = questions.find((x) => `set${x.appearances[0].set.slice(1)}:${x.appearances[0].n}` === key);
    if (!firsts.has(key)) problems.push(`BACKLOG has ${key}, which is not the first appearance of any question.`);
    else if (q.appearances.some((a) => labsFor[`set${a.set.slice(1)}:${a.n}`])) problems.push(`BACKLOG has ${key}, but a lab now covers it. Delete the entry.`);
  }
  return { questions, perSet, uncovered, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { questions, perSet, uncovered, problems } = analyse();
  if (process.argv.includes('--check')) {
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('every question has a lab or a recorded backlog topic');
  } else {
    const total = SETS.reduce((n, k) => n + perSet[k].total, 0);
    const covered = SETS.reduce((n, k) => n + perSet[k].covered, 0);
    console.log(`${LABS.length} labs cover ${covered} of ${total} practice questions (${SETS.map((k) => `${k}: ${perSet[k].covered}/${perSet[k].total}`).join(', ')}).`);
    console.log(`${questions.length} distinct questions; ${questions.filter((q) => q.labs.length).length} have a lab.\n`);
    console.log('Labs and the questions they practise:');
    for (const l of LABS) console.log(`  ${l.id.padEnd(24)} ${SETS.map((k) => (l.sourceQuestions[k]?.length ? `${short(k)}:${l.sourceQuestions[k].join(',')}` : '')).filter(Boolean).join('  ')}`);
    console.log('\nQuestions with no lab, by topic (a repeat is listed once, under its earliest set):');
    for (const [t, qs] of [...uncovered].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(qs.length).padStart(2)}  ${t}: ${qs.join(', ')}`);
    if (problems.length) { console.error(`\n${problems.join('\n')}`); process.exit(1); }
  }
}
