import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { GAP_MS, hasContent, id } from '../shared/model.mjs';
import { safeHtml } from './rich';

export function emptyRecord(schema) {
  return schema.nodes.record.create({ id:id(), createdAt:null, lastWrittenAt:null }, schema.nodes.paragraph.create());
}

export function documentFromNote(schema, note, { draftId = id(), trailing = false } = {}) {
  const entries = [...note.entries];
  if (note.draft?.html && hasContent(note.draft.html)) entries.push({ ...note.draft, id:draftId });
  const used = new Set(), nodes = [];
  const parse = entry => {
    const element = document.createElement('div'); element.innerHTML = safeHtml(entry.html);
    return DOMParser.fromSchema(schema).parse(element, { topNode:schema.nodes.record.create({ id:entry.id, createdAt:entry.createdAt, lastWrittenAt:entry.lastWrittenAt ?? entry.createdAt }) });
  };
  for (const entry of entries) {
    const group = note.groups.find(g => g.id === entry.groupId);
    if (!group) nodes.push(parse(entry));
    else if (!used.has(group.id)) {
      used.add(group.id);
      nodes.push(schema.nodes.noteGroup.create({ ...group }, entries.filter(e => e.groupId === group.id).map(parse)));
    }
  }
  for (const group of note.groups) if (!used.has(group.id)) nodes.splice(Math.min(group.position ?? nodes.length,nodes.length),0,schema.nodes.noteGroup.create(group,emptyRecord(schema)));
  if (!nodes.length || trailing) nodes.push(emptyRecord(schema));
  return schema.nodes.doc.create(null,nodes);
}

export function snapshotDocument(doc) {
  const serializer = DOMSerializer.fromSchema(doc.type.schema), entries = [], groups = [];
  function readRecord(node, groupId = null, preserveEmpty = false) {
    const element = document.createElement('div'); element.append(serializer.serializeFragment(node.content));
    const html = safeHtml(element.innerHTML);
    if (hasContent(html) || preserveEmpty || node.attrs.createdAt) entries.push({ id:node.attrs.id, html, groupId, createdAt:node.attrs.createdAt ?? Date.now(), lastWrittenAt:node.attrs.lastWrittenAt ?? node.attrs.createdAt ?? Date.now() });
  }
  doc.forEach((node,_offset,index) => {
    if (node.type.name === 'noteGroup') {
      groups.push({ id:node.attrs.id, title:node.attrs.title || '新分组', createdAt:node.attrs.createdAt, position:index });
      node.forEach((record,_offset,index) => readRecord(record,node.attrs.id,index<node.childCount-1));
    } else readRecord(node,null,index<doc.childCount-1);
  });
  return { entries,groups };
}

export function findTextMatches(doc, query) {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  const matches = [];
  doc.descendants((node,pos) => {
    if (node.type.name === 'noteGroup' && node.attrs.title.toLocaleLowerCase().includes(needle)) matches.push({ from:pos,to:pos+node.nodeSize,group:true });
    if (!node.isTextblock) return;
    const text = node.textBetween(0,node.content.size,'\n','\ufffc').toLocaleLowerCase();
    let offset=0,index;
    while ((index=text.indexOf(needle,offset)) !== -1) {
      matches.push({ from:pos+1+index,to:pos+1+index+query.length }); offset=index+Math.max(1,query.length);
    }
  });
  return matches;
}

export function timeBoundaries(doc) {
  const result=[]; let lastDay=null,lastRecord=null;
  doc.forEach((node,pos) => {
    let record=node;
    if(node.type.name==='noteGroup') record=node.firstChild;
    const stamp=record?.attrs.createdAt || node.attrs.createdAt;
    if(!stamp) return;
    const day=new Date(stamp).toLocaleDateString('sv-SE');
    const newDay=day!==lastDay;
    if(newDay || (node.type.name==='record' && (!lastRecord || stamp-(lastRecord.lastWrittenAt ?? lastRecord.createdAt)>=GAP_MS))) result.push({pos,stamp,newDay,showTime:node.type.name==='record'});
    lastDay=day; lastRecord=node.type.name==='record'?node.attrs:null;
  });
  return result;
}

export function mediaFromSnapshot(snapshot, type) {
  return snapshot.entries.flatMap(entry => {
    const element=document.createElement('div'); element.innerHTML=safeHtml(entry.html);
    return [...element.querySelectorAll(type==='image'?'img':'a[href]')].map((node,index)=>({ id:`${entry.id}-${index}`,entryId:entry.id,src:node.src,href:node.href,alt:node.alt || '笔记图片',label:node.textContent,context:element.textContent.trim(),createdAt:entry.createdAt }));
  });
}
