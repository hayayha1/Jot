import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileStore } from '../shared/store.mjs';
const setup=async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'suiji-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:new FileStore(dir)};};
test('关闭后重新打开，记录与草稿都从磁盘恢复',async t=>{
  const {dir,store}=await setup(t); const note=(await store.read()).notes[0];
  await store.mutate({type:'append_entry',noteId:note.id,html:'<p>已写下</p>'});
  await store.mutate({type:'set_draft',noteId:note.id,html:'<p>还没写完</p>'});
  const restored=await new FileStore(dir).read(); assert.equal(restored.notes[0].entries[0].html,'<p>已写下</p>');assert.equal(restored.notes[0].draft.html,'<p>还没写完</p>');
  assert.ok(JSON.parse(await fs.readFile(path.join(dir,'notes.json.bak'),'utf8')));
});
test('界面和 Agent 同时追加，所有记录都被保留',async t=>{
  const {dir,store}=await setup(t);const note=(await store.read()).notes[0];const agent=new FileStore(dir);
  await Promise.all(Array.from({length:24},(_,i)=>(i%2?agent:store).mutate({type:'append_entry',noteId:note.id,html:`<p>${i}</p>`})));
  const state=await store.read();assert.equal(state.notes[0].entries.length,24);assert.equal(new Set(state.notes[0].entries.map(e=>e.html)).size,24);assert.equal(state.revision,24);
});
test('损坏的文件不会被覆盖或重置',async t=>{
  const {dir,store}=await setup(t);await store.read();await fs.writeFile(path.join(dir,'notes.json'),'broken-json');
  await assert.rejects(()=>store.read(),/无法读取/);await assert.rejects(()=>store.mutate({type:'create_note',title:'新笔记'}));assert.equal(await fs.readFile(path.join(dir,'notes.json'),'utf8'),'broken-json');
});
test('两位写入者拿同一版本整理，只有第一位能成功',async t=>{
  const {dir,store}=await setup(t);const note=(await store.read()).notes[0];const second=new FileStore(dir);
  const result=await Promise.allSettled([store,second].map((s,i)=>s.mutate({type:'rename_note',noteId:note.id,title:`标题${i}`,expectedRevision:note.revision})));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected').length,1);
});
