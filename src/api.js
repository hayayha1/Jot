import { initialState, applyCommand } from '../shared/model.mjs';
const KEY = 'suiji-preview-v1';
let queue = Promise.resolve();
const web = {
  async read() {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    const state = initialState();
    localStorage.setItem(KEY, JSON.stringify(state));
    return state;
  },
  mutate(command) {
    const work = queue.then(async () => {
      const state = await web.read();
      const result = applyCommand(state, command);
      localStorage.setItem(KEY, JSON.stringify(state));
      return { state, result };
    });
    queue = work.catch(() => {});
    return work;
  },
  async info() { return { desktop: false, version: '0.1.0', dataDir: '当前浏览器的本地存储' }; },
  async copy(text) { await navigator.clipboard.writeText(text); },
  async openLink(raw) { const url = new URL(raw); if (['https:', 'http:', 'mailto:'].includes(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer'); },
  async export({ title, content }) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${title}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
  }
};
export const api = window.suiji || web;
