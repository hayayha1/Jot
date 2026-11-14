import { syncDocument } from './document-sync.mjs';
export const GAP_MS = 3 * 60 * 1000;
export const id = () => globalThis.crypto.randomUUID();
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const textToHtml = (text) => String(text).split('\n').map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
export const plainText = (html = '') => html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
export const hasImage = html => /<img\b/i.test(html);
export const hasLink = html => /<a\b|https?:\/\/[^\s<]+/i.test(html);
export const hasContent = html => !!plainText(html) || hasImage(html);

export function makeNote(title = '未命名笔记', now = Date.now()) {
  return { id: id(), title, createdAt: now, updatedAt: now, revision: 0, pinned: false, archived: false, entries: [], groups: [], draft: null };
}

export function initialState(now = Date.now()) {
  const welcome = makeNote('开始使用随记', now - 1000);
  welcome.entries = [
    { id: id(), html: '<p>欢迎来到随记。想法先记下来，整理的事可以晚一点。</p>', createdAt: now - 600000, updatedAt: now - 600000, groupId: null },
    { id: id(), html: '<p>直接在笔记上写字，Enter 换行。点击已有内容就能继续编辑，所有修改都会自动保存。</p>', createdAt: now - 590000, updatedAt: now - 590000, groupId: null },
    { id: id(), html: '<p>停写超过 3 分钟，下次记录会自动分组。用 Ctrl + G 新建一个有名字的分组，把相关的念头放在一起。</p>', createdAt: now - 300000, updatedAt: now - 300000, groupId: null },
    { id: id(), html: '<p>图片可以粘贴、拖入，也可以点击上方工具栏的图片按钮。Ctrl + G 会直接插入一个命名分组。</p>', createdAt: now - 290000, updatedAt: now - 290000, groupId: null },
    { id: id(), html: '<p>Ctrl + F 在当前笔记内查找，Enter 跳到下一处。点击查找框，可以筛选图片或超链接。Ctrl + K 搜索所有笔记。</p>', createdAt: now - 280000, updatedAt: now - 280000, groupId: null }
  ];
  const daily = makeNote('日常随记', now);
  return { schemaVersion: 1, revision: 0, notes: [daily, welcome] };
}

export function groupEntries(entries, groups = [], mode = 'time', includeEmpty = true) {
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const named = new Map(groups.map(g => [g.id, g]));
  const result = [];
  for (const entry of ordered) {
    let group = result.at(-1);
    const day = new Date(entry.createdAt).toLocaleDateString('sv-SE');
    if (entry.groupId && named.has(entry.groupId)) {
      group = result.find(g => g.manualId === entry.groupId);
      if (!group) {
        group = { id: entry.groupId, manualId: entry.groupId, title: named.get(entry.groupId).title, day, time: entry.createdAt, entries: [] };
        result.push(group);
      }
    } else if (!group || group.manualId || group.day !== day || (mode === 'time' && entry.createdAt - (group.entries.at(-1).lastWrittenAt ?? group.entries.at(-1).createdAt) >= GAP_MS)) {
      group = { id: entry.id, title: null, day, time: entry.createdAt, entries: [] };
      result.push(group);
    }
    group.entries.push(entry);
  }
  if (includeEmpty) for (const group of groups) {
    if (!result.some(g => g.manualId === group.id)) result.push({ id:group.id, manualId:group.id, title:group.title, day:new Date(group.createdAt).toLocaleDateString('sv-SE'), time:group.createdAt, entries:[] });
  }
  return result.sort((a, b) => a.time - b.time);
}

export function matchesEntry(entry, query = '', filter = 'all') {
  return (!query.trim() || plainText(entry.html).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || (entry.html.match(/href="([^"]+)"/g) || []).join(' ').toLowerCase().includes(query.trim().toLowerCase()))
    && (filter !== 'image' || hasImage(entry.html)) && (filter !== 'link' || hasLink(entry.html));
}

function requireString(value, name, max = 20000000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name}格式不正确或内容过长`);
  return value;
}

export function applyCommand(state, command, now = Date.now()) {
  const { type } = command;
  if (type === 'create_note') {
    const note = makeNote(requireString(command.title ?? '未命名笔记', '标题', 200).trim() || '未命名笔记', now);
    state.notes.unshift(note);
    state.revision++;
    return { noteId: note.id };
  }
  const note = state.notes.find(n => n.id === command.noteId);
  if (!note) throw new Error('这篇笔记不存在');
  if (command.expectedRevision !== undefined && command.expectedRevision !== note.revision) throw new Error('笔记已被更新，请重新读取后再整理。原始内容已保留。');
  let result = {};
  switch (type) {
    case 'sync_document': syncDocument(note, command, now); break;
    case 'rename_note': note.title = requireString(command.title, '标题', 200).trim() || '未命名笔记'; break;
    case 'pin_note': note.pinned = !!command.pinned; break;
    case 'archive_note': note.archived = !!command.archived; break;
    case 'set_draft': {
      const html = requireString(command.html, '草稿');
      if (command.groupId && !note.groups.some(g => g.id === command.groupId)) throw new Error('分组不存在');
      note.draft = hasContent(html) ? { html, groupId: command.groupId || null, createdAt: note.draft?.createdAt || now, updatedAt: now } : null;
      break;
    }
    case 'append_entry': {
      const html = requireString(command.html, '正文');
      if (!hasContent(html)) throw new Error('先写一点内容吧');
      if (command.groupId && !note.groups.some(g => g.id === command.groupId)) throw new Error('分组不存在');
      const entry = { id: id(), html, createdAt: command.fromDraft ? note.draft?.createdAt || now : now, lastWrittenAt: now, updatedAt: now, groupId: command.groupId || null };
      note.entries.push(entry);
      if (command.fromDraft) note.draft = null;
      result = { entryId: entry.id };
      break;
    }
    case 'update_entry': {
      const entry = note.entries.find(e => e.id === command.entryId);
      if (!entry) throw new Error('记录不存在');
      if (command.expectedUpdatedAt !== undefined && command.expectedUpdatedAt !== entry.updatedAt) throw new Error('这条记录已被 Agent 或另一个窗口修改，请复制你的内容后重新打开');
      const html = requireString(command.html, '正文');
      if (!hasContent(html)) throw new Error('记录不能为空；可使用删除按钮移除');
      entry.html = html;
      entry.updatedAt = now;
      break;
    }
    case 'remove_entry': {
      const entry = note.entries.find(e => e.id === command.entryId);
      if (!entry) throw new Error('记录不存在');
      result = { removed: structuredClone(entry) };
      note.entries = note.entries.filter(e => e.id !== command.entryId);
      break;
    }
    case 'restore_entry': {
      const entry = command.entry;
      if (!entry || typeof entry.id !== 'string' || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) throw new Error('记录格式不正确');
      requireString(entry.html, '正文');
      if (!note.entries.some(e => e.id === entry.id)) note.entries.push({ id: entry.id, html: entry.html, createdAt: entry.createdAt, lastWrittenAt: Number.isFinite(entry.lastWrittenAt) ? entry.lastWrittenAt : entry.createdAt, updatedAt: entry.updatedAt, groupId: note.groups.some(g => g.id === entry.groupId) ? entry.groupId : null });
      break;
    }
    case 'create_group': {
      const group = { id: id(), title: requireString(command.title, '组名', 200).trim() || '新分组', createdAt: now };
      note.groups.push(group);
      result = { groupId: group.id };
      break;
    }
    case 'rename_group': {
      const group = note.groups.find(g => g.id === command.groupId);
      if (!group) throw new Error('分组不存在');
      group.title = requireString(command.title, '组名', 200).trim() || '新分组';
      break;
    }
    case 'move_entries': {
      if (!Array.isArray(command.entryIds) || !command.entryIds.length || command.entryIds.some(eid => !note.entries.some(e => e.id === eid))) throw new Error('包含不存在的记录');
      if (command.groupId && !note.groups.some(g => g.id === command.groupId)) throw new Error('分组不存在');
      for (const entry of note.entries) if (command.entryIds.includes(entry.id)) entry.groupId = command.groupId || null;
      break;
    }
    default: throw new Error('不支持的操作');
  }
  note.revision++;
  if (type !== 'set_draft') note.updatedAt = now;
  state.revision++;
  return result;
}
