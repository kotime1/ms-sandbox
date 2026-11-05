import { visited } from './helpers.js';

const BLOCK_EMAIL = 'email-exe';
const BLOCK_USB = 'usb-untrusted';
const policies = (w) => w.defender.securityPolicies;
const asr = (w) => policies(w).filter((p) => p.type === 'asr');
const modeOf = (p, rule) => p.rules.find((r) => r.rule === rule)?.mode ?? null;

export default {
  id: 'asr-rules',
  title: 'Stop email attachments and USB malware',
  level: 'Beginner',
  minutes: 10,
  topics: ['Attack surface reduction', 'ASR rules', 'Endpoint security policies', 'Exploit protection', 'Controlled folder access'],
  examObjective: '1.1 Deploy Microsoft Defender for Endpoint',
  sourceQuestions: { set1: [], set2: [], set3: [1], set4: [], set5: [] },
  // How well this lab is backed by Microsoft documentation. Shown to the trainee. Never claims a live-tenant check.
  verification: { level: 'docs', note: 'Capabilities, platform support, rule names and the Warn limitations are from the Microsoft Learn attack surface reduction overview and ASR rules reference, checked 2026-11-02. The policy screens are simplified: the real wizard has more settings and per-rule exclusions.' },
  scenarios: [],
  withholdNotes: ['asr'],
  brief:
    'Your Microsoft 365 E5 tenant is deploying Defender for Endpoint. Two requirements came from the security team: block executable content that arrives in email, and block unsigned processes that run from USB drives. ' +
    'Create the policy that meets both, using the single capability that provides them. Start with Block mode, assign it to the Workstations group, and do not touch the servers. ' +
    'Read what each capability on offer is for before you choose: several of them sound close.',

  setup() { return []; },

  objectives: [
    {
      id: 'capability', text: 'Create a policy on the capability that contains rules for both requirements.',
      check: (w) => asr(w).length > 0,
    },
    {
      id: 'rules', text: 'The policy blocks executable content from email and blocks unsigned processes from USB.',
      check: (w) => asr(w).some((p) => modeOf(p, BLOCK_EMAIL) === 'block' && modeOf(p, BLOCK_USB) === 'block'),
    },
    {
      // Least privilege / blast radius: it applies to the workstations and nothing else.
      id: 'scope', text: 'The policy is assigned to the Workstations group only.',
      check: (w) => asr(w).some((p) => modeOf(p, BLOCK_EMAIL) === 'block' && modeOf(p, BLOCK_USB) === 'block' && p.deviceGroups.length === 1 && p.deviceGroups[0] === 'grp-workstations'),
    },
  ],

  steps: [
    { text: 'Open Settings and find the attack surface reduction policies.', target: 'nav:defender/rules', done: (w) => visited(w, 'defender/rules') },
    { text: 'Start a new policy and compare the capabilities.', target: 'btn:add-security-policy', done: (w) => policies(w).length > 0 },
    { text: 'Choose the capability, set the two rules to Block, and assign the Workstations group.', target: 'btn:wizard-finish', done: (w) => asr(w).some((p) => modeOf(p, BLOCK_EMAIL) === 'block') },
  ],

  hints: {
    capability: [
      'Two of the requirements are about specific software behaviours: opening a file type from email, and running a program from removable media. Which capability is described as "rules that constrain risky software behaviours"?',
      'Exploit protection hardens processes against vulnerabilities, controlled folder access protects folders from ransomware, and neither has per-behaviour rules. Block at first sight is not in this list at all: it is a cloud protection setting in Microsoft Defender Antivirus.',
      'Choose Attack surface reduction rules.',
    ],
    rules: [
      'Rule names are descriptive. Scan the list for the one about email and the one about USB.',
      'Look for "executable content from email client and webmail" and "untrusted and unsigned processes that run from USB". Set each to Block.',
      'Set "Block executable content from email client and webmail" and "Block untrusted and unsigned processes that run from USB" to Block, and leave every other rule as Not configured.',
    ],
    scope: [
      'Decide who needs the policy before you assign it.',
      'The servers are out of scope and the brief names a single group.',
      'On the Assignments step tick Workstations only.',
    ],
  },

  debrief: [
    'Attack surface reduction (ASR) rules are the capability that targets software behaviours: Office or email launching executables, scripts, processes started from USB. They are named for the behaviour they stop, which is how you find the right one in the list.',
    'The distractors protect something else. Exploit protection applies mitigations to processes so vulnerabilities are harder to abuse. Controlled folder access protects folders from untrusted apps, mainly against ransomware. Block at first sight is a cloud-delivered protection feature of Microsoft Defender Antivirus that blocks newly seen malware within seconds; it is not part of the attack surface reduction area.',
    'ASR rules, controlled folder access and exploit protection run on Windows only. Network protection, web protection and device control also cover macOS. If a question mentions a Mac, an ASR rule is not the answer.',
    'Audit mode records what a rule would have blocked without blocking it, so you can test against line-of-business apps first. Two rules (the LSASS rule and Office code injection) do not support Warn mode, which the sandbox enforces.',
  ],

  solution: () => [
    ['defender.createSecurityPolicy', { name: 'ASR baseline', type: 'asr', platform: 'Windows', deviceGroups: ['grp-workstations'], rules: [{ rule: BLOCK_EMAIL, mode: 'block' }, { rule: BLOCK_USB, mode: 'block' }] }],
  ],
};
