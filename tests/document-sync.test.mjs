import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, initialState } from '../shared/model.mjs';
import { rebaseDocument } from '../shared/document-sync.mjs';
function setup(){
  const state=initialState(1700000000000),note=state.notes[0];
  applyCommand(state,{type:'append_entry',noteId:note.id,html:'<p>第一段</p>'},1700000000000);
  applyCommand(state,{type:'append_entry',noteId:note.id,html:'<p>第二段</p>'},1700000001000);
  const base=structuredClone(note);
  const sync=(entries,groups=base.groups,extras={})=>applyCommand(state,{type:'sync_document',noteId:note.id,baseEntries:base.entries,baseGroups:base.groups,entries,groups,...extras},1700000010000);
  return {state,note,base,sync};
}
test('原地编辑保留记录 ID、创建时间和其他段落',()=>{
  const {note,base,sync}=setup();const entries=structuredClone(base.entries);entries[0].html='<p>原地改好了</p>';sync(entries);
  assert.equal(note.entries[0].html,'<p>原地改好了</p>');assert.equal(note.entries[0].id,base.entries[0].id);assert.equal(note.entries[0].createdAt,base.entries[0].createdAt);assert.equal(note.entries[1].html,base.entries[1].html);
});
test('用户编辑与 Agent 追加合并，不丢失远程新增段落',()=>{
  const {state,note,base,sync}=setup();applyCommand(state,{type:'append_entry',noteId:note.id,html:'<p>Agent 新增</p>'});
  const entries=structuredClone(base.entries);entries[0].html='<p>用户改动</p>';sync(entries);
  assert.deepEqual(note.entries.map(e=>e.html),['<p>用户改动</p>','<p>第二段</p>','<p>Agent 新增</p>']);
});
test('Agent 重新分组与用户编辑正文可以同时保留',()=>{
  const {state,note,base,sync}=setup();const {groupId}=applyCommand(state,{type:'create_group',noteId:note.id,title:'Agent 分组'});
  applyCommand(state,{type:'move_entries',noteId:note.id,entryIds:[base.entries[0].id],groupId});
  const entries=structuredClone(base.entries);entries[0].html='<p>用户改动</p>';sync(entries);
  assert.equal(note.entries[0].groupId,groupId);assert.equal(note.entries[0].html,'<p>用户改动</p>');assert.equal(note.groups[0].title,'Agent 分组');
});
test('同一段正文有并发编辑时拒绝覆盖',()=>{
  const {state,note,base,sync}=setup();applyCommand(state,{type:'update_entry',noteId:note.id,entryId:base.entries[0].id,html:'<p>Agent 改动</p>'});
  const entries=structuredClone(base.entries);entries[0].html='<p>用户改动</p>';assert.throws(()=>sync(entries),/暂未覆盖/);assert.equal(note.entries[0].html,'<p>Agent 改动</p>');
});
test('删除与合并段落会持久化，不删除 Agent 新增记录',()=>{
  const {state,note,base,sync}=setup();applyCommand(state,{type:'append_entry',noteId:note.id,html:'<p>远程段落</p>'});sync([{...base.entries[0],html:'<p>第一段第二段</p>'}]);
  assert.equal(note.entries.length,2);assert.equal(note.entries[1].html,'<p>远程段落</p>');
});
test('旧版未提交草稿完整迁入正文',()=>{
  const {state,note,base,sync}=setup();applyCommand(state,{type:'set_draft',noteId:note.id,html:'<p>旧版未完成内容</p>'});
  const draft=structuredClone(note.draft);sync([...base.entries,{id:crypto.randomUUID(),html:draft.html,groupId:null,createdAt:draft.createdAt}],[],{baseDraft:draft});assert.equal(note.draft,null);assert.equal(note.entries.at(-1).html,draft.html);
});
test('保存等待期间的新按键与远程追加可以同时保留',()=>{
  const {base}=setup();const submitted={entries:base.entries,groups:[]};
  const local=structuredClone(submitted);local.entries[0].html='<p>继续输入</p>';
  const server=structuredClone(submitted);server.entries.push({id:crypto.randomUUID(),html:'<p>远程追加</p>',groupId:null});
  const merged=rebaseDocument(local,submitted,server);assert.equal(merged.entries[0].html,'<p>继续输入</p>');assert.equal(merged.entries.at(-1).html,'<p>远程追加</p>');
});
test('重复记录 ID 与不存在的分组不会被保存',()=>{
  const {base,sync}=setup();assert.throws(()=>sync([base.entries[0],base.entries[0]]),/重复/);assert.throws(()=>sync([{...base.entries[0],groupId:'missing'}]),/分组不存在/);
});
