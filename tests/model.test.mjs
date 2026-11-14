import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, makeNote, applyCommand, groupEntries, matchesEntry, textToHtml, plainText } from '../shared/model.mjs';

const setup = () => { const state = initialState(1700000000000); const note = state.notes[0]; return { state, note, send: (type, args = {}, now = 1700000000000) => applyCommand(state, { type, noteId: note.id, ...args }, now) }; };
test('每一条记录都保留独立的时间，3 分钟边界产生新组', () => {
  const { note, send } = setup();
  send('append_entry', { html:'<p>第一条</p>' }, 1700000000000);
  send('append_entry', { html:'<p>第二条</p>' }, 1700000179999);
  send('append_entry', { html:'<p>第三条</p>' }, 1700000359999);
  const groups = groupEntries(note.entries);
  assert.deepEqual(groups.map(g=>g.entries.length), [2, 1]);
});
test('持续书写后，以最后写下时间判断停顿', () => {
  const { note, send } = setup();
  send('set_draft', { html:'<p>长一点的记录</p>' }, 1700000000000);
  send('append_entry', { html:'<p>长一点的记录</p>', fromDraft:true }, 1700000600000);
  send('append_entry', { html:'<p>继续记</p>' }, 1700000660000);
  assert.equal(groupEntries(note.entries).length, 1);
});
test('跨日即使不足三分钟也分别展示', () => {
  const first = new Date(2026, 10, 12, 23, 59).getTime();
  const { note, send } = setup();
  send('append_entry', { html:'<p>昨天</p>' }, first);
  send('append_entry', { html:'<p>今天</p>' }, first+120000);
  assert.equal(groupEntries(note.entries).length, 2);
});
test('命名分组保留原文、时间且可还原自动分组', () => {
  const { note, send } = setup();
  const { entryId } = send('append_entry', { html:'<p>灵感</p>' });
  const original = structuredClone(note.entries[0]);
  const { groupId } = send('create_group', { title:'产品灵感' });
  send('move_entries', { entryIds:[entryId], groupId });
  assert.equal(groupEntries(note.entries, note.groups)[0].title, '产品灵感');
  assert.equal(note.entries[0].createdAt, original.createdAt); assert.equal(note.entries[0].html, original.html);
  send('move_entries', { entryIds:[entryId], groupId:null });
  assert.equal(groupEntries(note.entries,note.groups)[0].manualId, undefined);
});
test('版本冲突拒绝整理，原文不被覆盖', () => {
  const { note, send } = setup();
  const revision=note.revision; send('append_entry', { html:'<p>新的想法</p>' });
  assert.throws(()=>send('rename_note', { title:'旧标题', expectedRevision:revision }), /已被更新/);
  assert.equal(note.title,'日常随记'); assert.equal(note.entries.length,1);
});
test('编辑记录冲突检查，编辑不改变创建时间', () => {
  const { note, send } = setup(); const { entryId }=send('append_entry',{html:'<p>旧内容</p>'});
  const old=structuredClone(note.entries[0]); send('update_entry',{entryId,html:'<p>新内容</p>',expectedUpdatedAt:old.updatedAt},1700000001000);
  assert.throws(()=>send('update_entry',{entryId,html:'<p>过时内容</p>',expectedUpdatedAt:old.updatedAt}),/已被/);
  assert.equal(note.entries[0].createdAt,old.createdAt); assert.equal(note.entries[0].html,'<p>新内容</p>');
});
test('草稿提交以单次操作清空草稿，不丢失图片', () => {
  const { note, send }=setup(); const html='<p>图片</p><img src="data:image/png;base64,AAAA">';
  send('set_draft',{html},1700000000000); send('append_entry',{html,fromDraft:true},1700000100000);
  assert.equal(note.draft,null); assert.equal(note.entries[0].createdAt,1700000000000); assert.equal(note.entries[0].html,html);
});
test('搜索支持正文、图片、链接和组合条件',()=>{
  const entry={html:'<p>设计稿</p><img src="data:image/png;base64,AA"><a href="https://example.com">参考网站</a>'};
  assert.ok(matchesEntry(entry,'设计','image')); assert.ok(matchesEntry(entry,'example.com','link')); assert.ok(!matchesEntry(entry,'不存在','all')); assert.ok(!matchesEntry({html:'<p>文字</p>'},'','image'));
});
test('纯文本进入 MCP 时会转义脚本和 HTML',()=>{
  const text='<script>alert("test")</script> & 学习😀\n第二行';
  const html=textToHtml(text); assert.ok(!html.includes('<script>')); assert.equal(plainText(html),text);
});
test('删除可撤销，错误的分组不会吞掉记录',()=>{
  const { note,send }=setup(); const {entryId}=send('append_entry',{html:'<p>保留</p>'}); const {removed}=send('remove_entry',{entryId}); assert.equal(note.entries.length,0);
  send('restore_entry',{entry:removed}); assert.equal(note.entries.length,1); assert.throws(()=>send('move_entries',{entryIds:[entryId],groupId:'missing'}),/分组不存在/); assert.equal(note.entries.length,1);
});
test('新建命名分组后立即展示空块，搜索时不显示无关空块',()=>{
  const {note,send}=setup(); const {groupId}=send('create_group',{title:'即刻出现'});
  const groups=groupEntries(note.entries,note.groups);assert.equal(groups.length,1);assert.equal(groups[0].manualId,groupId);assert.equal(groups[0].entries.length,0);
  assert.equal(groupEntries([],note.groups,'time',false).length,0);
});
