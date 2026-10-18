function browserSessionStorage() { try { return globalThis.sessionStorage; } catch { return undefined; } }
// Included customisations belong to a browser tab session unless the app is
// actually running standalone. Imported scores always stay in IndexedDB.
export function standaloneDisplay(environment = globalThis) {
  return environment.matchMedia?.('(display-mode: standalone)').matches === true
    || environment.navigator?.standalone === true;
}
export class RepertoireCatalogue {
  constructor({ store, standalone = standaloneDisplay(), session = browserSessionStorage() } = {}) {
    this.store = store; this.standalone = standalone; this.session = session;
    this.included = []; this.custom = {}; this.key = 'vocal-coach:included-catalogue:v1';
  }
  async load() {
    try { this.custom = (this.standalone ? await this.store.setting('included-catalogue') : JSON.parse(this.session?.getItem(this.key) || '{}')) || {};
      if(this.standalone && !Object.keys(this.custom).length && await this.store.setting('included-catalogue') === undefined) {
        for(const file of await this.store.setting('hidden-builtins') || [])this.custom[`included:${file}`]={hidden:true};
      } }
    catch { this.custom = {}; }
  }
  async save() {
    if (this.standalone) await this.store.setting('included-catalogue', this.custom);
    else { try { this.session?.setItem(this.key, JSON.stringify(this.custom)); } catch { /* Session memory still works. */ } }
  }
  async customise(id, patch) {
    this.custom[id] = { ...this.custom[id], ...patch }; await this.save();
  }
  async restore() { this.custom = {}; await this.save(); }
  rows(imports = []) {
    return [ ...this.included.map(entry => ({ ...entry, id: `included:${entry.file}`, source: 'included',
      filename: entry.file.split('/').at(-1), ...this.custom[`included:${entry.file}`] })).filter(entry => !entry.hidden),
      ...imports.map(record => ({ ...record, source: 'imported' })) ];
  }
}
