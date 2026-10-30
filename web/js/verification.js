// How well a lab is backed by Microsoft documentation. Honest labels: nothing here has been checked against a live tenant.
export const LEVELS = {
  docs: { label: 'Matches Microsoft Learn', kind: 'ok', help: 'Checked against Microsoft Learn documentation. Not checked against a live tenant.' },
  partial: { label: 'Simplified vs Learn', kind: '', help: 'The core behavior matches Microsoft Learn, but the real screens or options are more detailed than this sandbox.' },
  exam: { label: 'Unverified', kind: 'warn', help: 'This comes from a practice question only. Microsoft Learn did not confirm it. Check it in a real tenant before relying on it.' },
};
export const levelOf = (v) => LEVELS[v?.level] ?? LEVELS.exam;
