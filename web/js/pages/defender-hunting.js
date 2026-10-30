import { h } from '../dom.js';
import { queryEditor } from '../components/query-editor.js';
import { openDetectionWizard } from '../components/detection-wizard.js';
import { ctx } from '../app.js';

export async function render(host) {
  host.append(
    h('h1', null, 'Advanced hunting'),
    h('p', { class: 'muted' }, 'Query Microsoft Defender XDR tables and Microsoft Sentinel workspace tables together, in one place (KQL, a supported subset). Real path: Investigation & response > Hunting > Advanced hunting.'));
  await queryEditor(host, 'defender', {
    // The real portal: run and check the query, then "Create detection rule" opens the six-step wizard with the query filled in.
    extra: (getQuery) => h('button', { class: 'btn', type: 'button', 'data-target': 'btn:create-detection', onclick: async () => {
      const d = await ctx.view('defender');
      const f = await ctx.view('defender-files');
      await openDetectionWizard({ query: getQuery(), devices: d.devices, groups: f.deviceGroups });
    } }, 'Create detection rule'),
  });
}
