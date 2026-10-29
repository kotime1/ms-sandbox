import { h } from '../dom.js';
import { queryEditor } from '../components/query-editor.js';

export async function render(host) {
  host.append(
    h('h1', null, 'Logs'),
    h('p', { class: 'muted' }, 'Workspace: law-sentinel · Language: KQL (a supported subset: where, project, extend, summarize, sort, take, top, distinct, count, union, render).'));
  await queryEditor(host, 'sentinel');
}
