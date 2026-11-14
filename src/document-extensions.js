import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { canSplit } from '@tiptap/pm/transform';
import { joinTextblockBackward, joinTextblockForward } from '@tiptap/pm/commands';
import { id } from '../shared/model.mjs';
import { findTextMatches, timeBoundaries } from './document-model';

export const decorationKey = new PluginKey('suijiNoteSearch');
export const NoteDocument = Node.create({ name:'doc',topNode:true,content:'(record | noteGroup)+' });
export const Record = Node.create({
  name:'record', content:'block+', defining:true,
  addAttributes:()=>({id:{default:null},createdAt:{default:null},lastWrittenAt:{default:null}}),
  parseHTML:()=>[{tag:'section[data-record-id]'}],
  renderHTML:({node,HTMLAttributes})=>['section',mergeAttributes(HTMLAttributes,{class:'document-record','data-record-id':node.attrs.id}),0],
  addKeyboardShortcuts() {
    return {
      'Mod-End':()=>{const {state,view}=this.editor;view.dispatch(state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView());view.focus();return true;},
      'Mod-Home':()=>{const {state,view}=this.editor;view.dispatch(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());view.focus();return true;},
      Backspace:()=>{
        const {state,view}=this.editor,{$cursor}=state.selection;
        if(!$cursor||$cursor.parentOffset!==0||$cursor.depth<2||$cursor.node($cursor.depth-1).type.name!=='record'||$cursor.index($cursor.depth-1)!==0)return false;
        const cut=state.doc.resolve($cursor.before($cursor.depth-1));
        return cut.nodeBefore?.type.name==='record'?joinTextblockBackward(state,view.dispatch,view):false;
      },
      Delete:()=>{
        const {state,view}=this.editor,{$cursor}=state.selection;
        if(!$cursor||$cursor.parentOffset!==$cursor.parent.content.size||$cursor.depth<2||$cursor.node($cursor.depth-1).type.name!=='record'||$cursor.index($cursor.depth-1)!==$cursor.node($cursor.depth-1).childCount-1)return false;
        const cut=state.doc.resolve($cursor.after($cursor.depth-1));
        return cut.nodeAfter?.type.name==='record'?joinTextblockForward(state,view.dispatch,view):false;
      },
      Enter:()=>{
      const {view}=this.editor,state=view.state;
      if(view.composing) return false;
      const initial=state.selection.$from;
      if(!initial.parent.isTextblock||initial.parent.type.name==='codeBlock'||initial.depth<2||initial.node(initial.depth-1).type.name!=='record')return false;
      let tr=state.tr.deleteSelection();const {$from}=tr.selection;
      if(!$from.parent.isTextblock || $from.parent.type.name==='codeBlock' || $from.depth<2 || $from.node($from.depth-1).type.name!=='record') return false;
      const textType=$from.parent.type.name==='heading'&&$from.parentOffset===$from.parent.content.size?state.schema.nodes.paragraph:$from.parent.type;
      const now=Date.now();
      const types=[{type:state.schema.nodes.record,attrs:{id:id(),createdAt:now,lastWrittenAt:now}},{type:textType,attrs:$from.parent.attrs}];
      if(!canSplit(tr.doc,$from.pos,2,types)) return false;
      const marks=(state.storedMarks || $from.marks()).filter(mark=>mark.type.name!=='link');
      tr=tr.split($from.pos,2,types).setStoredMarks(marks);view.dispatch(tr.scrollIntoView());return true;
    }};
  }
});

export const NoteGroup = Node.create({
  name:'noteGroup',content:'record+',defining:true,
  addAttributes:()=>({id:{default:null},title:{default:'新分组'},createdAt:{default:null}}),
  parseHTML:()=>[{tag:'section[data-note-group]'}],
  renderHTML:({node})=>['section',{'data-note-group':node.attrs.id,class:'document-group'},0],
  addNodeView(){return ({node,editor,getPos})=>{
    let current=node;
    const dom=document.createElement('section');dom.className='document-group';dom.dataset.noteGroup=node.attrs.id;
    const heading=document.createElement('div');heading.className='document-group-heading';heading.contentEditable='false';
    const icon=document.createElement('span');icon.textContent='▱';icon.className='group-folder-icon';
    const title=document.createElement('input');title.className='group-title';title.value=node.attrs.title;title.maxLength=200;title.setAttribute('aria-label','分组名称');
    title.addEventListener('input',()=>{if(!editor.isEditable){title.value=current.attrs.title;return;}const pos=getPos();if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,title:title.value}));});
    title.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();const pos=getPos(),selection=editor.state.selection;if(selection.from<pos+1||selection.to>pos+current.nodeSize-1)editor.commands.setTextSelection(pos+3);editor.view.focus();}});
    const caption=document.createElement('span');caption.className='group-edit-caption';caption.textContent='直接在组内编辑';
    heading.append(icon,title,caption);
    const contentDOM=document.createElement('div');contentDOM.className='document-group-content';dom.append(heading,contentDOM);
    return {dom,contentDOM,update(next){if(next.type!==current.type)return false;current=next;dom.dataset.noteGroup=next.attrs.id;if(document.activeElement!==title)title.value=next.attrs.title;title.readOnly=!editor.isEditable;return true;},stopEvent:event=>heading.contains(event.target),ignoreMutation:mutation=>heading.contains(mutation.target)};
  };}
});

export const RecordMetadata=Extension.create({
  name:'recordMetadata',
  addProseMirrorPlugins(){return [new Plugin({appendTransaction(transactions,oldState,newState){
    if(!transactions.some(tr=>tr.docChanged)||transactions.some(tr=>tr.getMeta('externalSync')))return null;
    const old=new Map();oldState.doc.descendants(node=>{if(node.attrs.id)old.set(node.attrs.id,node);});
    const seen=new Set(),tr=newState.tr,now=Date.now();
    newState.doc.descendants((node,pos)=>{
      if(!['record','noteGroup'].includes(node.type.name))return;
      const attrs={...node.attrs};let changed=false;
      if(!attrs.id||seen.has(attrs.id)){attrs.id=id();changed=true;}seen.add(attrs.id);
      if(node.type.name==='noteGroup'&&!attrs.createdAt){attrs.createdAt=now;changed=true;}
      if(node.type.name==='record'&&!attrs.createdAt&&(node.textContent||node.content.toString().includes('image')||pos+node.nodeSize<newState.doc.content.size)){attrs.createdAt=now;attrs.lastWrittenAt=now;changed=true;}
      if(changed)tr.setNodeMarkup(pos,undefined,attrs);
    });
    return tr.docChanged?tr:null;
  }})];}
});

function boundaryWidget(boundary){
  const root=document.createElement('div');root.className='document-time-heading';root.contentEditable='false';
  if(boundary.newDay){const day=document.createElement('span');day.className='document-day';const date=new Date(boundary.stamp);const today=new Date();const yesterday=new Date();yesterday.setDate(today.getDate()-1);day.textContent=date.toDateString()===today.toDateString()?'今天':date.toDateString()===yesterday.toDateString()?'昨天':date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});root.append(day);}
  if(boundary.showTime){const time=document.createElement('time');time.textContent=new Date(boundary.stamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});root.append(time);}
  return root;
}
export const NoteDecorations=Extension.create({
  name:'noteDecorations',
  addProseMirrorPlugins(){return [new Plugin({
    key:decorationKey,
    state:{init:()=>({query:'',index:0,mode:'plain',matches:[]}),apply(tr,previous){const settings=tr.getMeta(decorationKey)||{};const next={...previous,...settings};if(tr.docChanged||settings.query!==undefined)next.matches=findTextMatches(tr.doc,next.query);next.index=next.matches.length?((next.index%next.matches.length)+next.matches.length)%next.matches.length:0;return next;}},
    props:{decorations(state){const settings=decorationKey.getState(state);const decorations=settings.matches.map((match,index)=>match.group?Decoration.node(match.from,match.to,{class:index===settings.index?'group-search-hit-active':'group-search-hit'}):Decoration.inline(match.from,match.to,{class:`search-hit ${index===settings.index?'search-hit-active':''}`}));if(settings.mode==='time')for(const boundary of timeBoundaries(state.doc))decorations.push(Decoration.widget(boundary.pos,()=>boundaryWidget(boundary),{side:-1,key:`time-${boundary.pos}-${boundary.stamp}-${boundary.newDay}`}));return DecorationSet.create(state.doc,decorations);}}
  })];}
});

export function replaceEditorDocument(editor,doc){
  if(editor.isDestroyed||editor.state.doc.eq(doc))return;
  const {selection}=editor.state;let anchor=null,offset=0;
  for(let depth=selection.$anchor.depth;depth>0;depth--)if(selection.$anchor.node(depth).type.name==='record'){anchor=selection.$anchor.node(depth).attrs.id;offset=selection.anchor-selection.$anchor.before(depth);break;}
  let pos=null;doc.descendants((node,start)=>{if(node.type.name==='record'&&node.attrs.id===anchor)pos=Math.min(start+Math.max(2,offset),start+node.nodeSize-2);});
  const tr=editor.state.tr.replaceWith(0,editor.state.doc.content.size,doc.content).setMeta('externalSync',true).setMeta('addToHistory',false);
  if(pos!==null)tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos,tr.doc.content.size))));
  editor.view.dispatch(tr);
}
