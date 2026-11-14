import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { groupCurrentLines } from '../src/document-commands.mjs';
import { noteScrollTarget } from '../src/note-scroll.mjs';

const schema=new Schema({nodes:{
  doc:{content:'(record | noteGroup)+'},
  text:{group:'inline'},
  paragraph:{content:'text*',group:'block'},
  record:{content:'paragraph+',attrs:{id:{default:null},createdAt:{default:null},lastWrittenAt:{default:null}}},
  noteGroup:{content:'record+',attrs:{id:{default:null},title:{default:'新分组'},createdAt:{default:null}}}
}});
const record=(text,stamp=123)=>schema.nodes.record.create({id:crypto.randomUUID(),createdAt:stamp,lastWrittenAt:stamp},schema.nodes.paragraph.create(null,text?schema.text(text):null));
const position=(doc,index,offset=0)=>{let pos=2;for(let i=0;i<index;i++)pos+=doc.child(i).nodeSize;return pos+offset;};
test('分组原地包住光标所在行，保留内容、记录标识和时间',()=>{
  const rows=[record('前一行'),record('光标所在的一行',456),record('后一行')],doc=schema.nodes.doc.create(null,rows);
  const pos=position(doc,1,3),state=EditorState.create({schema,doc,selection:TextSelection.create(doc,pos)});
  const result=groupCurrentLines(state,999),next=result.transaction.doc;
  assert.equal(next.childCount,3);assert.equal(next.child(1).type.name,'noteGroup');assert.equal(next.child(1).childCount,1);assert.ok(next.child(1).firstChild.eq(rows[1]));assert.ok(next.child(0).eq(rows[0]));assert.ok(next.child(2).eq(rows[2]));assert.equal(result.transaction.selection.head,pos+1);
});
test('选中多行时整体原地分组，不额外插入空行',()=>{
  const rows=[record('第一行'),record('第二行'),record('第三行')],doc=schema.nodes.doc.create(null,rows);
  const state=EditorState.create({schema,doc,selection:TextSelection.create(doc,position(doc,0),position(doc,1,2))});
  const next=groupCurrentLines(state).transaction.doc;
  assert.equal(next.childCount,2);assert.equal(next.firstChild.childCount,2);assert.equal(next.textContent,doc.textContent);assert.ok(next.lastChild.eq(rows[2]));
});
test('空白的当前行直接变成分组，不生成第二个记录',()=>{
  const row=record(''),doc=schema.nodes.doc.create(null,row),state=EditorState.create({schema,doc,selection:TextSelection.create(doc,2)});
  const next=groupCurrentLines(state).transaction.doc;assert.equal(next.childCount,1);assert.equal(next.firstChild.childCount,1);assert.equal(next.firstChild.firstChild.attrs.id,row.attrs.id);
});
test('已有分组中的行复用现有分组，不创建嵌套或重复块',()=>{
  const group=schema.nodes.noteGroup.create({id:crypto.randomUUID(),title:'已有分组',createdAt:100},record('组内文字'));
  const doc=schema.nodes.doc.create(null,group),state=EditorState.create({schema,doc,selection:TextSelection.create(doc,3)});
  const result=groupCurrentLines(state);assert.equal(result.groupId,group.attrs.id);assert.equal(result.transaction,null);
});
test('正文定位只计算内部滚动距离，可见行不移动',()=>{
  const scroller={scrollTop:100,clientHeight:200,scrollHeight:1000};
  assert.equal(noteScrollTarget(scroller,{top:80},{top:110,bottom:135}),100);
  assert.equal(noteScrollTarget(scroller,{top:80},{top:300,bottom:325}),163);
  assert.equal(noteScrollTarget(scroller,{top:80},{top:40,bottom:65}),42);
});
test('查找居中和长内容定位的滚动距离不会超过正文边界',()=>{
  const scroller={scrollTop:0,clientHeight:200,scrollHeight:1000};
  assert.equal(noteScrollTarget(scroller,{top:80},{top:1100,bottom:1120}),800);
  assert.equal(noteScrollTarget(scroller,{top:80},{top:-100,bottom:-80},{center:true}),0);
  assert.equal(noteScrollTarget(scroller,{top:80},{top:300,bottom:320},{center:true}),130);
});
