import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Selection } from '@tiptap/pm/state';
import { id } from '../shared/model.mjs';
import { sameDocument, rebaseDocument } from '../shared/document-sync.mjs';
import { safeHtml, imageData } from './rich';
import { documentFromNote, snapshotDocument } from './document-model';
import { NoteDocument, Record, NoteGroup, RecordMetadata, NoteDecorations, decorationKey, replaceEditorDocument } from './document-extensions';
import { groupCurrentLines } from './document-commands.mjs';
import { revealNoteElement, scrollNoteToSelection } from './note-scroll.mjs';

export default forwardRef(function Editor({ note, mode, query, matchIndex, filtered, onSave, onSnapshot, onStatus, onError, onSearchState, onFormat, onReady }, ref) {
  const handlers=useRef();handlers.current={onSave,onSnapshot,onStatus,onError,onSearchState,onFormat,onReady};
  const fileInput=useRef(), editorRef=useRef(), initial=useRef(note);
  const control=useRef({base:note,snapshot:null,sequence:0,dirty:false,inflight:null,timer:null,ready:false,pendingImages:new Set(),draftId:id(),mounted:true});

  function report(error){handlers.current.onStatus('error');handlers.current.onError(error.message || String(error));}
  function announce(editor){
    const settings=decorationKey.getState(editor.state);
    handlers.current.onSearchState({count:settings.matches.length,index:settings.index});
    handlers.current.onFormat({bold:editor.isActive('bold'),list:editor.isActive('bulletList'),code:editor.isActive('codeBlock')});
  }
  function publish(){if(control.current.mounted&&control.current.snapshot)handlers.current.onSnapshot(control.current.snapshot);}
  function applySnapshot(snapshot){
    const editor=editorRef.current;
    if(editor&&!editor.isDestroyed&&!sameDocument(snapshotDocument(editor.state.doc),snapshot)) replaceEditorDocument(editor,documentFromNote(editor.schema,snapshot));
  }
  async function flush(){
    const c=control.current;clearTimeout(c.timer);
    if(c.pendingImages.size)await Promise.all([...c.pendingImages]);
    if(c.inflight){await c.inflight;if(c.dirty)return flush();return;}
    c.inflight=(async()=>{
      while(c.dirty){
        const submitted=structuredClone(c.snapshot),sequence=c.sequence,base=c.base;
        handlers.current.onStatus('saving');
        try{
          const response=await handlers.current.onSave({type:'sync_document',noteId:base.id,baseEntries:base.entries,baseGroups:base.groups,entries:submitted.entries,groups:submitted.groups,baseDraft:base.draft || null});
          const server=response.state.notes.find(n=>n.id===base.id);
          const merged=c.sequence===sequence?{entries:server.entries,groups:server.groups}:rebaseDocument(c.snapshot,submitted,server);
          c.base=server;c.snapshot=merged;
          if(c.mounted)applySnapshot(merged);
          c.dirty=c.sequence!==sequence;publish();
        }catch(error){report(error);throw error;}
      }
      handlers.current.onStatus('saved');
    })();
    try{await c.inflight;}finally{c.inflight=null;}
  }
  function schedule(){
    const c=control.current;c.dirty=true;c.sequence++;handlers.current.onStatus('saving');clearTimeout(c.timer);
    c.timer=setTimeout(()=>flush().catch(()=>{}),180);
  }
  function insertFiles(files){
    const work=(async()=>{
      for(const file of files){const src=await imageData(file);const editor=editorRef.current;if(editor&&!editor.isDestroyed)editor.chain().focus().setImage({src,alt:file.name || '粘贴的图片'}).run();}
    })().catch(report).finally(()=>control.current.pendingImages.delete(work));
    control.current.pendingImages.add(work);return work;
  }
  function focusEnd(){
    const editor=editorRef.current;if(!editor||editor.isDestroyed)return;
    editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)).scrollIntoView());
    editor.view.focus();
  }

  const editor=useEditor({
    extensions:[NoteDocument,Record,NoteGroup,StarterKit.configure({document:false,trailingNode:false,link:{openOnClick:false,autolink:true,defaultProtocol:'https',protocols:['https','http','mailto']}}),Image.configure({allowBase64:true}),Placeholder.configure({placeholder:'从这里开始，随手记下…'}),RecordMetadata,NoteDecorations],
    editorProps:{
      attributes:{class:'note-canvas rich-text',role:'textbox','aria-label':'笔记正文','aria-multiline':'true'},
      handleScrollToSelection:scrollNoteToSelection,
      handleDOMEvents:{
        mousedown(_view,event){if(event.button===0&&event.target.closest('a[href]')){event.preventDefault();return true;}return false;},
        click(_view,event){const a=event.target.closest('a[href]');if(!a)return false;event.preventDefault();window.dispatchEvent(new CustomEvent('suiji:open-link',{detail:a.href}));return true;}
      },
      transformPastedHTML:html=>safeHtml(html),
      handlePaste(_view,event){
        const files=[...(event.clipboardData?.files || [])].filter(file=>file.type.startsWith('image/'));
        if(files.length){event.preventDefault();insertFiles(files);return true;}
        const text=event.clipboardData?.getData('text/plain')?.trim();
        if(text&&/^(https?:\/\/|mailto:)[^\s]+$/i.test(text)){
          try{const url=new URL(text);if(['https:','http:','mailto:'].includes(url.protocol)){event.preventDefault();editorRef.current.chain().insertContent({type:'text',text,marks:[{type:'link',attrs:{href:url.href}}]}).unsetMark('link').run();return true;}}catch{}
        }
        return false;
      },
      handleDrop(_view,event,_slice,moved){if(moved)return false;const files=[...(event.dataTransfer?.files || [])].filter(file=>file.type.startsWith('image/'));if(files.length){event.preventDefault();insertFiles(files);return true;}return false;}
    },
    onCreate({editor}){
      const c=control.current;editorRef.current=editor;
      replaceEditorDocument(editor,documentFromNote(editor.schema,initial.current,{draftId:c.draftId}));
      c.snapshot=snapshotDocument(editor.state.doc);c.ready=true;publish();announce(editor);
      if(initial.current.draft)schedule();handlers.current.onReady();
    },
    onUpdate({editor,transaction}){
      if(!control.current.ready||transaction.getMeta('externalSync'))return;
      control.current.snapshot=snapshotDocument(editor.state.doc);publish();announce(editor);schedule();
    },
    onSelectionUpdate({editor}){announce(editor);}
  });
  editorRef.current=editor;

  useEffect(()=>{
    const c=control.current;
    if(!c.ready||c.dirty||c.inflight||note.revision<=c.base.revision)return;
    c.base=note;c.snapshot={entries:note.entries,groups:note.groups};applySnapshot(c.snapshot);publish();
  },[note.revision,editor]);
  useEffect(()=>{
    if(!editor)return;
    editor.setEditable(!note.archived&&!filtered);
    editor.view.dispatch(editor.state.tr.setMeta(decorationKey,{query,index:matchIndex,mode}));announce(editor);
    if(query&&!filtered)requestAnimationFrame(()=>revealNoteElement(editor.view.dom.querySelector('.search-hit-active,.group-search-hit-active')));
  },[editor,mode,query,matchIndex,filtered,note.archived]);
  useEffect(()=>()=>{const c=control.current;c.mounted=false;clearTimeout(c.timer);if(c.dirty)flush().catch(()=>{});},[]);

  useImperativeHandle(ref,()=>({
    flush,
    focus:focusEnd,
    image:()=>fileInput.current?.click(),
    bold:()=>editor?.chain().focus().toggleBold().run(),
    list:()=>editor?.chain().focus().toggleBulletList().run(),
    code:()=>editor?.chain().focus().toggleCodeBlock().run(),
    undo:()=>editor?.chain().focus().undo().run(),
    redo:()=>editor?.chain().focus().redo().run(),
    link:url=>editor?.chain().focus().insertContent({type:'text',text:url,marks:[{type:'link',attrs:{href:url}}]}).unsetMark('link').run(),
    snapshot:()=>control.current.snapshot,
    locate:entryId=>{if(!editor)return;let target;editor.state.doc.descendants((node,pos)=>{if(node.type.name==='record'&&node.attrs.id===entryId)target=pos+2;});if(target!==undefined){editor.commands.setTextSelection(target);editor.view.focus();revealNoteElement(editor.view.dom.querySelector(`[data-record-id="${entryId}"]`));}},
    newGroup:()=>{
      if(!editor||note.archived)return;
      const result=groupCurrentLines(editor.state);
      if(!result)return;
      if(result.transaction)editor.view.dispatch(result.transaction);
      const input=editor.view.dom.querySelector(`[data-note-group="${result.groupId}"] .group-title`);input?.focus({preventScroll:true});input?.select();
    }
  }),[editor,note.archived]);

  return <div className={`note-document ${filtered?'document-hidden':''}`} onMouseDown={event=>{if(event.target===event.currentTarget){event.preventDefault();focusEnd();}}}><EditorContent editor={editor}/><input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple onChange={event=>{insertFiles([...event.target.files]);event.target.value='';}}/></div>;
});
