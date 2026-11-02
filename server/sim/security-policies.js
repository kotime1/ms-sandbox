// Attack surface reduction capabilities and the ASR rule catalogue. Sources (checked 2026-11-02):
//   learn.microsoft.com/defender-endpoint/attack-surface-reduction-overview         (capabilities, platform table)
//   learn.microsoft.com/defender-endpoint/attack-surface-reduction-rules-reference  (rule names, modes, Warn support)
// Descriptions are original paraphrases. Rule names are the Microsoft Intune names, which is what the portal shows.
// "Block at first sight" is deliberately absent: it is a Microsoft Defender Antivirus cloud protection feature, not part of this area.

import { SimError } from './world-errors.js';

export const PLATFORMS = ['Windows', 'macOS', 'Linux'];
export const MODES = ['block', 'audit', 'warn']; // "Not configured" is represented by leaving the rule out

/** Capability -> where it exists and what it is for. `rules` marks the one that has per-rule settings. */
export const CAPABILITIES = Object.freeze({
  asr: { label: 'Attack surface reduction rules', platforms: ['Windows'], rules: true, summary: 'Rules that stop specific risky software behaviours, for example an Office app starting a child process or an unsigned program running from a USB drive.' },
  cfa: { label: 'Controlled folder access', platforms: ['Windows'], rules: false, summary: 'Lets only trusted apps change files in the folders you protect, which limits what ransomware can encrypt.' },
  exploit: { label: 'Exploit protection', platforms: ['Windows'], rules: false, summary: 'Applies exploit mitigation techniques to operating system processes and apps so a vulnerability is harder to abuse.' },
  network: { label: 'Network protection', platforms: ['Windows', 'macOS'], rules: false, summary: 'Blocks outbound connections to low-reputation domains and IP addresses.' },
  web: { label: 'Web protection', platforms: ['Windows', 'macOS'], rules: false, summary: 'Protects against web threats and lets you regulate unwanted content, including content filtering and custom indicators.' },
  device: { label: 'Device control', platforms: ['Windows', 'macOS'], rules: false, summary: 'Decides whether users can use removable media, printers and Bluetooth devices.' },
});

// id, Intune name, supports Warn mode. Two rules do not support Warn (per the reference page).
const R = (id, name, warn = true) => ({ id, name, warn });
export const ASR_RULES = Object.freeze([
  R('vulnerable-drivers', 'Block abuse of exploited vulnerable signed drivers (Device)'),
  R('lsass', 'Block credential stealing from the Windows local security authority subsystem', false),
  R('wmi-persistence', 'Block persistence through WMI event subscription'),
  R('adobe-child', 'Block Adobe Reader from creating child processes'),
  R('office-child', 'Block all Office applications from creating child processes'),
  R('email-exe', 'Block executable content from email client and webmail'),
  R('untrusted-exe', 'Block executable files from running unless they meet a prevalence, age, or trusted list criterion'),
  R('obfuscated-scripts', 'Block execution of potentially obfuscated scripts'),
  R('js-vbs-download', 'Block JavaScript or VBScript from launching downloaded executable content'),
  R('office-exe-content', 'Block Office applications from creating executable content'),
  R('office-injection', 'Block Office applications from injecting code into other processes', false),
  R('office-comm-child', 'Block Office communication application from creating child processes'),
  R('psexec-wmi', 'Block process creations originating from PSExec and WMI commands'),
  R('safe-mode', 'Block rebooting machine in Safe Mode'),
  R('usb-untrusted', 'Block untrusted and unsigned processes that run from USB'),
  R('copied-tools', 'Block use of copied or impersonated system tools'),
  R('webshell', 'Block Webshell creation for Servers'),
  R('office-macro-win32', 'Block Win32 API calls from Office macros'),
  R('ransomware', 'Use advanced protection against ransomware'),
]);
const RULE_BY_ID = new Map(ASR_RULES.map((r) => [r.id, r]));
export const MAX_POLICIES = 30;

/** Validate a policy and return the normalised fields. Throws SimError with portal-style wording. */
export function buildPolicy(p, { groups, existing }) {
  const cap = CAPABILITIES[p.type];
  if (!cap) throw new SimError('Choose a capability.');
  if (existing.length >= MAX_POLICIES) throw new SimError(`You can create at most ${MAX_POLICIES} security policies in the sandbox.`);
  if (existing.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) throw new SimError(`A policy named '${p.name}' already exists.`);
  if (!cap.platforms.includes(p.platform)) {
    throw new SimError(`${cap.label} ${cap.platforms.length === 1 ? `is available only on ${cap.platforms[0]}` : `is available on ${cap.platforms.join(' and ')}`}, not on ${p.platform}.`);
  }
  const scope = [...new Set(p.deviceGroups)];
  if (!scope.length) throw new SimError('Assign the policy to at least one device group.');
  const bad = scope.find((g) => !groups.includes(g));
  if (bad) throw new SimError(`'${bad}' is not a device group in this tenant.`);

  if (!cap.rules) {
    if (p.rules.length) throw new SimError(`${cap.label} has no per-rule settings. Per-rule modes belong to Attack surface reduction rules.`);
    return { scope, rules: [] };
  }
  if (!p.rules.length) throw new SimError('Choose at least one rule and a mode. Rules left as Not configured do nothing.');
  const seen = new Set();
  for (const r of p.rules) {
    const def = RULE_BY_ID.get(r.rule);
    if (!def) throw new SimError(`'${r.rule}' is not an attack surface reduction rule.`);
    if (seen.has(r.rule)) throw new SimError(`'${def.name}' is set more than once.`);
    seen.add(r.rule);
    if (r.mode === 'warn' && !def.warn) throw new SimError(`'${def.name}' doesn't support Warn mode. Use Block or Audit.`);
  }
  return { scope, rules: p.rules.map((r) => ({ rule: r.rule, mode: r.mode })) };
}
