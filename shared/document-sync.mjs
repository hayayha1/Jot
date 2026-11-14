const entryFields = ['html', 'groupId'];
const groupFields = ['title', 'position'];
const value = (item, key) => item?.[key] ?? null;
export const sameEntry = (a, b) => !!a && !!b && entryFields.every(key => value(a, key) === value(b, key));
export const sameGroup = (a, b) => !!a && !!b && groupFields.every(key => value(a, key) === value(b, key));
export const sameDocument = (a, b) => a.entries.length === b.entries.length && a.groups.length === b.groups.length
  && a.entries.every((entry, i) => entry.id === b.entries[i].id && sameEntry(entry, b.entries[i]))
  && a.groups.every(group => sameGroup(group, b.groups.find(g => g.id === group.id)));

function validate(items, groups = false) {
  if (!Array.isArray(items) || items.length > 50000) throw new Error('笔记内容格式不正确');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('笔记中存在重复或无效的记录标识');
    ids.add(item.id);
    if (groups) {
      if (typeof item.title !== 'string' || item.title.length > 200) throw new Error('分组名称过长');
      if (item.position != null && (!Number.isInteger(item.position) || item.position < 0)) throw new Error('分组位置不正确');
    } else if (typeof item.html !== 'string' || item.html.length > 20000000) throw new Error('笔记正文格式不正确或过长');
  }
}

function mergeItems(current, base, incoming, fields, now, groups) {
  const previous = new Map(base.map(item => [item.id, item]));
  const existing = new Map(current.map(item => [item.id, item]));
  const desired = new Map(incoming.map(item => [item.id, item]));
  for (const old of base) {
    if (!desired.has(old.id)) {
      const latest = existing.get(old.id);
      if (latest && fields.some(key => value(old, key) !== value(latest, key))) throw new Error('这段内容已被 Agent 修改，删除未执行。你的编辑仍保留在笔记中。');
      existing.delete(old.id);
    }
  }
  for (const item of incoming) {
    const old = previous.get(item.id), latest = existing.get(item.id);
    if (!old) {
      if (latest && fields.some(key => value(latest, key) !== value(item, key))) throw new Error('记录发生冲突，请保留当前内容后重新打开');
      if (!latest) existing.set(item.id, groups
        ? { id:item.id, title:item.title.trim() || '新分组', createdAt:Number.isFinite(item.createdAt) ? item.createdAt : now, position:item.position ?? incoming.indexOf(item) }
        : { id:item.id, html:item.html, groupId:item.groupId || null, createdAt:Number.isFinite(item.createdAt) ? item.createdAt : now, updatedAt:now, lastWrittenAt:Number.isFinite(item.lastWrittenAt) ? item.lastWrittenAt : now });
      continue;
    }
    const changed = fields.filter(key => value(item, key) !== value(old, key));
    if (!changed.length) continue;
    if (!latest) throw new Error('这条记录已在另一处删除。你的编辑仍保留在笔记中，请复制后重新打开。');
    for (const key of changed) {
      if (value(latest, key) !== value(old, key) && value(latest, key) !== value(item, key)) throw new Error('这段内容已被 Agent 修改，暂未覆盖。你的编辑仍保留在笔记中，请复制后重新打开。');
      latest[key] = item[key] ?? null;
    }
    if (!groups) latest.updatedAt = now;
  }
  const ordered = incoming.map(item => existing.get(item.id)).filter(Boolean);
  for (const item of existing.values()) if (!desired.has(item.id)) ordered.push(item);
  return ordered;
}

export function syncDocument(note, command, now) {
  if (note.archived) throw new Error('请先恢复归档笔记，再编辑正文');
  const { baseEntries, baseGroups, entries, groups } = command;
  validate(baseEntries); validate(entries); validate(baseGroups, true); validate(groups, true);
  const knownGroups = new Set([...note.groups, ...groups].map(group => group.id));
  for (const entry of entries) if (entry.groupId && !knownGroups.has(entry.groupId)) throw new Error('记录所属的分组不存在');
  // Merge individual changed fields, preserving unrelated Agent additions and regrouping.
  const nextEntries = mergeItems(structuredClone(note.entries), baseEntries, entries, entryFields, now, false);
  const nextGroups = mergeItems(structuredClone(note.groups), baseGroups, groups, groupFields, now, true);
  for (const group of note.groups) {
    if (!nextGroups.some(g => g.id === group.id) && nextEntries.some(e => e.groupId === group.id)) nextGroups.push(group);
  }
  if (command.baseDraft) {
    if (note.draft && (note.draft.html !== command.baseDraft.html || note.draft.updatedAt !== command.baseDraft.updatedAt)) throw new Error('草稿已在另一处更新，请保留内容后重新打开');
    note.draft = null;
  }
  note.entries = nextEntries;
  note.groups = nextGroups;
}

// Keep keystrokes typed during an in-flight save when incorporating the server response.
export function rebaseDocument(local, submitted, server) {
  function rebase(items, oldItems, remoteItems, fields) {
    const old = new Map(oldItems.map(item => [item.id,item]));
    const remote = new Map(remoteItems.map(item => [item.id,{...item}]));
    const localIds = new Set(items.map(item => item.id));
    for (const before of oldItems) if (!localIds.has(before.id)) remote.delete(before.id);
    for (const item of items) {
      const before = old.get(item.id);
      if (!before) remote.set(item.id,{...item});
      else for (const key of fields) if (value(item,key) !== value(before,key)) remote.set(item.id,{...(remote.get(item.id) || item),[key]:item[key]});
    }
    const result = items.map(item => remote.get(item.id)).filter(Boolean);
    for (const item of remote.values()) if (!localIds.has(item.id)) result.push(item);
    return result;
  }
  return { entries:rebase(local.entries,submitted.entries,server.entries,entryFields), groups:rebase(local.groups,submitted.groups,server.groups,groupFields) };
}
