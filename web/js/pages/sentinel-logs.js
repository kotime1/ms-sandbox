import { h } from '../dom.js';
import { queryEditor } from '../components/query-editor.js';

export async function render(host) {
  host.append(
    h('h1', null, 'Logs'),
    h('p', { class: 'muted' }, 'In the Defender portal this is the same Advanced hunting page, which queries Sentinel workspace tables and Defender tables together. (Azure portal: Logs.) KQL, a supported subset.'));
  await queryEditor(host, 'sentinel');
}
