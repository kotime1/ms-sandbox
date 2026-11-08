// UEBA settings actions. Rules and wording: ueba.js.

import { enable, connectSource, disconnectSource, setEntraSync, UEBA_SOURCES } from './ueba.js';

const SOURCE_IDS = UEBA_SOURCES.map((s) => s.id);

export const UEBA_ACTIONS = {
  'ueba.enable': {
    spec: {},
    run({ w }) {
      w.ueba = enable(w.ueba);
      w.uebaLog.push({ op: 'enable' });
      return {};
    },
  },
  'ueba.connectSource': {
    spec: { source: { type: 'enum', values: SOURCE_IDS } },
    run({ w }, p) {
      w.ueba = connectSource(w.ueba, p.source);
      w.uebaLog.push({ op: 'connect', source: p.source });
      return {};
    },
  },
  'ueba.disconnectSource': {
    spec: { source: { type: 'enum', values: SOURCE_IDS } },
    run({ w }, p) {
      w.ueba = disconnectSource(w.ueba, p.source);
      w.uebaLog.push({ op: 'disconnect', source: p.source });
      return {};
    },
  },
  'ueba.entraSync': {
    spec: { on: { type: 'boolean' } },
    run({ w }, p) {
      w.ueba = setEntraSync(w.ueba, p.on);
      w.uebaLog.push({ op: 'entraSync', on: p.on });
      return {};
    },
  },
};
