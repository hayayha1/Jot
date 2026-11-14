import React, { useEffect, useState, useRef, useMemo } from 'react';
import { BookOpen, SquarePen, Search, X, Plus, ArrowUp, Image as ImageIcon, Link2, AlignLeft, Clock3, Pin, PinOff, MoreHorizontal, ChevronDown, Check, CheckCheck, FolderClosed, FolderPlus, Settings2, PanelLeftClose, PanelLeftOpen, Copy, Download, Archive, RotateCcw, Trash2, Pencil, Bold, List, Code2, Keyboard, ArrowDown, Cable, FileText, ChevronRight, CornerDownLeft, LoaderCircle, AlertCircle } from 'lucide-react';
import Editor from './Editor';
import { api } from './api';
import { groupEntries, matchesEntry, plainText, hasContent, hasImage, hasLink } from '../shared/model.mjs';
import { safeHtml, exportHtml } from './rich';

const time = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
function dayLabel(value) {
  const date = new Date(value), today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const delta = Math.round((today - day) / 86400000);
  if (delta === 0) return '今天'; if (delta === 1) return '昨天';
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}
const fullDate = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
function IconButton({ icon: Icon, title, className = '', ...props }) { return <button className={`icon-button ${className}`} title={title} aria-label={title} {...props}><Icon size={17} strokeWidth={1.65} /></button>; }

function Dialog({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    const focusables = () => [...node.querySelectorAll('input,button,textarea,[tabindex="0"]')].filter(el => !el.disabled);
    focusables()[0]?.focus();
    const listener = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { const els = focusables(); if (event.shiftKey && document.activeElement === els[0]) { event.preventDefault(); els.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === els.at(-1)) { event.preventDefault(); els[0]?.focus(); } }
    };
    node.addEventListener('keydown', listener); return () => { node.removeEventListener('keydown', listener); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="dialog-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton icon={X} title="关闭" onClick={onClose} /></div>{children}</section></div>;
}

function TextDialog({ title, label, initial = '', submitLabel = '创建分组', onSubmit, onClose, placeholder }) {
  const [value, setValue] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Dialog title={title} onClose={onClose}><form onSubmit={async event => { event.preventDefault(); if (!value.trim() || busy) return; setBusy(true); try { await onSubmit(value.trim()); onClose(); } catch(e) { setError(e.message); } finally { setBusy(false); } }}><label className="field-label" htmlFor="dialog-input">{label}</label><input id="dialog-input" className="text-field" value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} maxLength={200} autoComplete="off" />{error&&<p className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!value.trim() || busy}>{busy ? '处理中…' : submitLabel}</button></div></form></Dialog>;
}

export default function App() {
  const [state, setState] = useState(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem('suiji-active-note'));
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState(() => localStorage.getItem('suiji-view') || 'time');
  const [sort, setSort] = useState('updatedAt'); const [showArchived, setShowArchived] = useState(false);
  const [sidebar, setSidebar] = useState(true); const [modal, setModal] = useState(null); const [menu, setMenu] = useState(false);
  const [groupId, setGroupId] = useState(null); const [draftHtml, setDraftHtml] = useState('');
  const [status, setStatus] = useState('saved'); const [failure, setFailure] = useState(''); const [toast, setToast] = useState(null);
  const [info, setInfo] = useState(null); const [editing, setEditing] = useState(null);
  const composer = useRef(); const search = useRef(); const scroller = useRef(); const bottom = useRef(); const draftRef = useRef('');
  const current = useRef(); const mutations = useRef(0); const stateRef = useRef(null); const draftSequence = useRef(0); const draftCache = useRef(new Map()); const submitting = useRef(false);
  const focusTitleFor = useRef(null);
  const note = state?.notes.find(n => n.id === activeId);
  current.current = { note, groupId };
  const acceptState = next => {
    if (!stateRef.current || next.revision >= stateRef.current.revision) { stateRef.current = next; setState(next); }
  };
  const notify = (text, action) => setToast({ text, action, id: Date.now() });
  const report = message => { setFailure(message); setStatus('error'); };
  async function mutate(command, { quiet = false } = {}) {
    mutations.current++; if (!quiet) setStatus('saving');
    try { const response = await api.mutate(command); acceptState(response.state); setFailure(''); if (mutations.current === 1) setStatus('saved'); return response; }
    catch (error) { report(error.message); throw error; }
    finally { mutations.current--; }
  }
  const safely = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(() => {});
  useEffect(() => {
    api.read().then(next => {
      acceptState(next);
      setActiveId(prev => next.notes.some(n => n.id === prev && !n.archived) ? prev : next.notes.find(n => n.title === '开始使用随记' && !n.archived)?.id || next.notes.find(n => !n.archived)?.id || null);
    }).catch(e => report(e.message));
    api.info().then(setInfo).catch(e => report(e.message));
    const interval = setInterval(() => {
      if (!mutations.current) api.read().then(acceptState).catch(e => report(e.message));
    }, 1600);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => { if (toast) { const timeout = setTimeout(() => setToast(null), toast.action ? 12000 : 3500); return () => clearTimeout(timeout); } }, [toast]);
  useEffect(() => {
    if (!note) return;
    localStorage.setItem('suiji-active-note', note.id);
    const draft = draftCache.current.has(note.id) ? draftCache.current.get(note.id) : note.draft;
    draftRef.current = draft?.html || ''; setDraftHtml(draftRef.current); setGroupId(draft?.groupId || null); setEditing(null); setMenu(false);
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      if (focusTitleFor.current === note.id) {
        focusTitleFor.current = null;
        const field = document.querySelector('.note-title'); field?.focus(); field?.select();
      } else if (!document.activeElement?.closest('.search-box')) composer.current?.focus();
    });
  }, [note?.id]);
  useEffect(() => { localStorage.setItem('suiji-view', mode); }, [mode]);
  useEffect(() => {
    const field = document.querySelector('.note-title');
    if (field && document.activeElement !== field) field.value = note?.title || '';
  }, [note?.title, note?.id]);
  useEffect(() => {
    const closeMenu = () => setMenu(false); window.addEventListener('click', closeMenu); return () => window.removeEventListener('click', closeMenu);
  }, []);
  const saveDraft = (html, nextGroup = current.current.groupId) => {
    draftRef.current = html; setDraftHtml(html); const n = current.current.note; if (!n) return Promise.resolve();
    draftSequence.current++; draftCache.current.set(n.id,{html,groupId:nextGroup,sequence:draftSequence.current});
    return mutate({ type: 'set_draft', noteId: n.id, html: safeHtml(html), groupId: nextGroup }).catch(() => {});
  };
  useEffect(() => {
    window.suijiFlush = async () => {
      const n = current.current.note;
      if (n && !n.archived) {
        const title = document.querySelector('.note-title')?.value;
        if (typeof title === 'string' && title.trim() !== n.title) await mutate({ type:'rename_note',noteId:n.id,title });
        await mutate({ type:'set_draft',noteId:n.id,html:safeHtml(draftRef.current),groupId:current.current.groupId });
      }
      return true;
    };
    return () => { delete window.suijiFlush; };
  }, []);
  async function newNote() {
    const { result } = await mutate({ type: 'create_note', title: '未命名笔记' }); focusTitleFor.current = result.noteId; setShowArchived(false); setQuery(''); setFilter('all'); setActiveId(result.noteId);
  }
  async function submit() {
    const n = current.current.note; const html = composer.current?.html() || draftRef.current;
    if (!n || !hasContent(html) || submitting.current) return;
    submitting.current = true;
    const sequence = draftCache.current.get(n.id)?.sequence;
    try {
      await mutate({ type: 'append_entry', noteId: n.id, html: safeHtml(html), groupId: current.current.groupId, fromDraft: true });
      if (sequence === draftCache.current.get(n.id)?.sequence) { draftCache.current.set(n.id,null); if(current.current.note?.id===n.id) { composer.current?.clear(); draftRef.current = ''; setDraftHtml(''); } }
      else if(current.current.note?.id===n.id) await saveDraft(composer.current?.html() || '');
      if(current.current.note?.id===n.id) { composer.current?.focus(); requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })); }
    } finally { submitting.current = false; }
  }
  useEffect(() => {
    const shortcut = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'f') { event.preventDefault(); setSidebar(true); setTimeout(() => search.current?.focus(), 0); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); safely(newNote)(); }
      if (event.key.toLowerCase() === 'g' && current.current.note && !current.current.note.archived) { event.preventDefault(); setModal({ type: 'group' }); }
      if (event.key === 'Enter') { event.preventDefault(); safely(submit)(); }
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const visibleNotes = useMemo(() => (state?.notes || []).filter(n => n.archived === showArchived && ((!query.trim() && filter === 'all') || (filter === 'all' && n.title.toLowerCase().includes(query.trim().toLowerCase())) || n.entries.some(e => matchesEntry(e, query, filter)))).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b[sort] - a[sort]), [state, query, filter, sort, showArchived]);
  useEffect(() => { if ((query || filter !== 'all') && visibleNotes.length && !visibleNotes.some(n => n.id === activeId)) setActiveId(visibleNotes[0].id); }, [query, filter, visibleNotes.map(n=>n.id).join(',')]);
  const searching = !!query.trim() || filter !== 'all';
  const entries = useMemo(() => note?.entries.filter(e => matchesEntry(e, filter === 'all' && note.title.toLowerCase().includes(query.trim().toLowerCase()) ? '' : query, filter)) || [], [note, query, filter]);
  const groups = useMemo(() => groupEntries(entries, note?.groups, mode, !searching), [entries, note?.groups, mode, searching]);
  const count = note?.entries.reduce((n,e)=>n + plainText(e.html).replace(/\s/g, '').length, 0) || 0;
  const onRichClick = e => {
    const a = e.target.closest('a[href]'); if (a) { e.preventDefault(); api.openLink(a.href).catch(error => report(error.message)); }
    const image = e.target.closest('img'); if (image) setModal({ type: 'image', src: image.src, alt: image.alt });
  };
  const createGroup = async title => {
    const n = current.current.note;
    const { result } = await mutate({ type: 'create_group', noteId: n.id, title });
    setGroupId(result.groupId); current.current.groupId = result.groupId; await saveDraft(composer.current?.html() || '', result.groupId); setTimeout(() => composer.current?.focus(), 0);
  };
  async function archiveNote() {
    const archived = !note.archived;
    await mutate({ type: 'archive_note', noteId: note.id, archived });
    setActiveId(stateRef.current.notes.find(n => n.archived === showArchived && n.id !== note.id)?.id || null);
    notify(archived ? '笔记已移至归档' : '笔记已恢复', () => mutate({ type: 'archive_note', noteId: note.id, archived: !archived }));
  }
  if (!state) return <div className="loading"><BookOpen size={38} /><p>{failure || '正在打开随记…'}</p>{failure && <button className="button secondary" onClick={()=>location.reload()}>重新打开</button>}</div>;

  return <div className={`app ${sidebar ? '' : 'sidebar-hidden'}`}>
    {sidebar && <aside className="sidebar">
      <div className="brand-row"><div className="brand"><span className="brand-icon"><BookOpen size={22} strokeWidth={1.6} /></span><span>随记<span className="brand-period">.</span></span></div><IconButton icon={SquarePen} title="新建笔记 Ctrl+N" onClick={safely(newNote)} /></div>
      <div className="search-box"><Search size={16} /><input ref={search} aria-label="搜索笔记" placeholder="搜索笔记…" value={query} onChange={e=>setQuery(e.target.value)} />{query ? <button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={14}/></button> : <kbd>Ctrl K</kbd>}</div>
      <div className="filter-tabs" aria-label="内容筛选">{[{id:'all',name:'全部',icon:AlignLeft},{id:'image',name:'图片',icon:ImageIcon},{id:'link',name:'链接',icon:Link2}].map(({id,name,icon:Icon})=><button key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}><Icon size={14}/>{name}</button>)}</div>
      <div className="list-heading"><button className={showArchived?'archive-label':''} onClick={()=>{setShowArchived(!showArchived);setQuery('');setFilter('all');const next=state.notes.find(n=>n.archived!==showArchived);setActiveId(next?.id||null);}}>{showArchived?'归档笔记':'我的笔记'}<ChevronDown size={13}/></button><button title={sort==='updatedAt'?'按更新时间排列，点击改为创建时间':'按创建时间排列，点击改为更新时间'} onClick={()=>setSort(sort==='updatedAt'?'createdAt':'updatedAt')}><Clock3 size={13}/><span>{sort==='updatedAt'?'最近编辑':'最近创建'}</span></button></div>
      <div className="note-list">{visibleNotes.map(n=>{
        const last=n.entries.at(-1); const snippet=plainText(n.draft?.html||last?.html||''); const matches=n.entries.filter(e=>matchesEntry(e,query,filter));
        return <button key={n.id} className={`note-item ${n.id===activeId?'selected':''}`} onClick={()=>setActiveId(n.id)}><div className="note-item-title"><span>{n.title}</span>{n.pinned?<Pin size={12}/>:<span className="note-dot"/>}</div><p>{hasImage(last?.html||'')&&<ImageIcon size={12}/>}<span>{snippet||'还没有内容，写下第一笔吧'}</span></p><div className="note-item-meta"><span>{dayLabel(n.updatedAt)} {time(n.updatedAt)}</span><span>{searching?`${matches.length} 条匹配`:`${n.entries.length} 条记录`}</span></div></button>;
      })}{!visibleNotes.length&&<div className="list-empty"><Search size={25}/><p>{searching?'没有找到相关笔记':showArchived?'还没有归档的笔记':'空白，也是个好开始'}</p>{searching&&<button onClick={()=>{setQuery('');setFilter('all');}}>清除筛选</button>}</div>}</div>
      <button className="new-note" onClick={safely(newNote)}><Plus size={16}/><span>新建笔记</span><kbd>Ctrl N</kbd></button>
      <div className="sidebar-footer"><span><i/>{info?.desktop?'本地笔记':'浏览器预览'}</span><IconButton icon={Settings2} title="偏好设置" onClick={()=>setModal({type:'settings'})}/></div>
    </aside>}
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb"><IconButton icon={sidebar?PanelLeftClose:PanelLeftOpen} title={sidebar?'收起笔记列表':'展开笔记列表'} onClick={()=>setSidebar(!sidebar)}/><span>{showArchived?'归档':'我的笔记'}</span>{note&&<><ChevronRight size={12}/><span className="breadcrumb-title">{note.title}</span></>}</div><div className="topbar-actions"><button className="mcp-button" onClick={()=>setModal({type:'mcp'})}><Cable size={15}/><span>连接 Agent</span></button><span className="topbar-divider"/><IconButton icon={Keyboard} title="快捷键" onClick={()=>setModal({type:'shortcuts'})}/></div></header>
      {note ? <>
        <div className="note-heading"><div className="note-heading-main"><div className="eyebrow"><span className="tiny-dot"/>{note.archived?'已归档':note.title==='开始使用随记'?'很高兴遇见你':'给想法一个落脚的地方'}</div><input key={note.id+':title'} className="note-title" aria-label="笔记标题" defaultValue={note.title} maxLength={200} onBlur={e=>{if(e.target.value.trim()!==note.title)safely(()=>mutate({type:'rename_note',noteId:note.id,title:e.target.value}))();}} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur();composer.current?.focus();}}}/><div className="note-subtitle"><span>{fullDate(note.createdAt)}</span><span className="meta-dot">·</span><span>{note.entries.length} 条记录</span><span className="meta-dot">·</span><span>{count.toLocaleString()} 字</span></div></div><div className="heading-actions"><IconButton icon={note.pinned?PinOff:Pin} title={note.pinned?'取消置顶':'置顶笔记'} className={note.pinned?'is-pinned':''} onClick={safely(()=>mutate({type:'pin_note',noteId:note.id,pinned:!note.pinned}))}/><div className="menu-wrap"><IconButton icon={MoreHorizontal} title="笔记操作" onClick={e=>{e.stopPropagation();setMenu(!menu);}}/>{menu&&<div className="dropdown"><button onClick={safely(async()=>{if(await api.export({title:note.title,content:exportHtml(note)}))notify('笔记已导出，图片也一起保留了');})}><Download size={15}/>导出笔记<span>HTML</span></button><button onClick={safely(archiveNote)}><Archive size={15}/>{note.archived?'恢复笔记':'归档笔记'}</button><button onClick={()=>setModal({type:'shortcuts'})}><Keyboard size={15}/>快捷键</button></div>}</div></div></div>
        <div className="view-toolbar"><div className="view-tabs"><button className={mode==='time'?'active':''} onClick={()=>setMode('time')}><Clock3 size={14}/>时间分组</button><button className={mode==='plain'?'active':''} onClick={()=>setMode('plain')}><AlignLeft size={14}/>连续笔记</button></div><span className="view-hint">{searching?<><Search size={12}/>{entries.length} 条匹配<IconButton icon={X} title="清除筛选" onClick={()=>{setQuery('');setFilter('all');}}/></>:<><span className="interval-dot"/>间隔 3 分钟自动分组</>}</span></div>
        <div className={`entries-scroll ${mode==='plain'?'plain-view':''}`} ref={scroller}>
          <div className="entries-content">{!groups.length ? <div className="editor-empty"><span className="empty-illustration">{searching?<Search size={31}/>:<SquarePen size={31}/>}</span><h3>{searching?'这里还没有匹配的记录':'从一个小念头开始'}</h3><p>{searching?'试试其他关键词，或切换内容筛选。':'一句话、一张图、一个链接。随手记下，就好。'}</p>{!searching&&<button onClick={()=>composer.current?.focus()}>写下第一条 <ArrowDown size={14}/></button>}</div> : groups.map((g,index)=>{
            const showDay=index===0||groups[index-1].day!==g.day;
            return <React.Fragment key={g.id}>{showDay&&<div className="day-divider"><span>{dayLabel(g.time)}</span><span className="day-date">{new Date(g.time).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}</span><i/></div>}<section className={`entry-group ${g.manualId?'named-group':''}`}>
              {(mode==='time'||g.manualId)&&<div className="group-heading">{g.manualId?<><FolderClosed size={14}/><button onClick={()=>setModal({type:'rename-group',group:g})}>{g.title}</button><span className="group-count">{g.entries.length}</span>{!note.archived&&<button className="write-in-group" title="继续在此分组记录" onClick={()=>{setGroupId(g.manualId);current.current.groupId=g.manualId;saveDraft(composer.current?.html()||'',g.manualId);composer.current?.focus();}}><Plus size={14}/></button>}</>:<><span className="time-line-dot"/><time>{time(g.time)}</time><span className="group-count">{g.entries.length} 条记录</span></>}</div>}
              <div className="group-entries">{!g.entries.length&&<button className="empty-group-button" onClick={()=>{setGroupId(g.manualId);current.current.groupId=g.manualId;saveDraft(composer.current?.html()||'',g.manualId);composer.current?.focus();}}>在这个分组里，写下第一条想法… <Pencil size={12}/></button>}{g.entries.map(entry=><article className="entry" key={entry.id}>
                <div className="entry-body rich-text" onClick={onRichClick} dangerouslySetInnerHTML={{__html:safeHtml(entry.html,query)}}/>
                <div className="entry-actions"><time title={new Date(entry.createdAt).toLocaleString('zh-CN')}>{time(entry.createdAt)}</time><IconButton icon={Copy} title="复制记录" onClick={safely(async()=>{await api.copy(plainText(entry.html));notify('已复制文字');})}/>{!note.archived&&<><IconButton icon={Pencil} title="编辑记录" onClick={()=>setEditing({ ...entry, noteId:note.id })}/><IconButton icon={Trash2} title="删除记录" onClick={safely(async()=>{const {result}=await mutate({type:'remove_entry',noteId:note.id,entryId:entry.id});notify('记录已删除',()=>mutate({type:'restore_entry',noteId:note.id,entry:result.removed}));})}/></>}</div>
              </article>)}</div>
            </section></React.Fragment>;
          })}<div ref={bottom}/>{entries.length>0&&!searching&&<div className="end-marker"><span/>每个念头，都有迹可循<span/></div>}</div>
        </div>
        {!note.archived?<div className="composer-area"><div className={`composer ${groupId?'in-group':''}`}>{groupId&&<div className="composer-group"><FolderClosed size={13}/><span>记录到</span><strong>{note.groups.find(g=>g.id===groupId)?.title||'分组'}</strong><IconButton icon={X} title="退出分组，继续随记" onClick={()=>{setGroupId(null);current.current.groupId=null;saveDraft(composer.current?.html()||'',null);}}/></div>}<Editor key={note.id} ref={composer} content={(draftCache.current.has(note.id)?draftCache.current.get(note.id)?.html:note.draft?.html)||''} onChange={saveDraft} onSubmit={safely(submit)} onError={notify}/><div className="composer-toolbar"><div className="editor-tools"><IconButton icon={ImageIcon} title="插入图片，也可直接粘贴或拖入" onClick={()=>composer.current?.image()}/><IconButton icon={Link2} title="插入链接" onClick={()=>setModal({type:'link'})}/><span className="tool-divider"/><IconButton icon={Bold} title="加粗 Ctrl+B" onClick={()=>composer.current?.bold()}/><IconButton icon={List} title="项目列表" onClick={()=>composer.current?.list()}/><IconButton icon={Code2} title="代码块" onClick={()=>composer.current?.code()}/><span className="tool-divider"/><button className="group-tool" title="新建命名分组 Ctrl+G" onClick={()=>setModal({type:'group'})}><FolderPlus size={16}/><span>分组</span></button></div><button className="submit-button" aria-label="记下这一条" title="记下这一条 Enter" disabled={!hasContent(draftHtml)} onClick={safely(submit)}><ArrowUp size={17}/></button></div></div><div className="composer-caption"><span>Enter 记下 <span className="caption-dot">·</span> Shift + Enter 换行</span><span className={`save-status ${status}`} title={failure||'草稿和记录自动保存在本地'}>{status==='saving'?<LoaderCircle size={12} className="spin"/>:status==='error'?<AlertCircle size={12}/>:<CheckCheck size={13}/>} {status==='saving'?'正在保存':status==='error'?'保存失败':'已自动保存'}</span></div></div>:<div className="archived-notice"><Archive size={16}/>这篇笔记已归档，恢复后可以继续记录。<button onClick={safely(archiveNote)}>恢复笔记</button></div>}
      </> : <div className="no-note"><BookOpen size={43}/><h2>留一点空白，装下生活。</h2><p>选一篇笔记，或开始新的记录。</p><button className="button primary" onClick={safely(newNote)}><Plus size={16}/>新建笔记</button></div>}
      {failure&&<div className="error-banner" role="alert"><AlertCircle size={16}/><span>{failure}</span><button onClick={()=>setFailure('')} aria-label="关闭错误提示"><X size={15}/></button></div>}
    </main>
    {toast&&<div className="toast" role="status"><Check size={15}/><span>{toast.text}</span>{toast.action&&<button onClick={safely(async()=>{await toast.action();setToast(null);})}>撤销</button>}<button className="toast-close" aria-label="关闭提示" onClick={()=>setToast(null)}><X size={13}/></button></div>}
    {modal?.type==='group'&&<TextDialog title="给想法分个组" label="分组名称" placeholder="例如：项目灵感、今天的待办…" onClose={()=>setModal(null)} onSubmit={createGroup}/>}
    {modal?.type==='rename-group'&&<TextDialog title="修改分组名称" label="分组名称" initial={modal.group.title} submitLabel="保存名称" onClose={()=>setModal(null)} onSubmit={title=>mutate({type:'rename_group',noteId:note.id,groupId:modal.group.manualId,title})}/>}
    {modal?.type==='link'&&<TextDialog title="留住一个好链接" label="网址" placeholder="https://" submitLabel="插入链接" onClose={()=>setModal(null)} onSubmit={url=>{if(!/^https?:\/\//i.test(url))throw new Error('请填写以 https:// 或 http:// 开头的网址');new URL(url);composer.current?.link(url);}}/>}
    {modal?.type==='shortcuts'&&<Dialog title="让记录更顺手" subtitle="少一点操作，多一点专注。" onClose={()=>setModal(null)}><div className="shortcut-list">{[['新建笔记','Ctrl','N'],['搜索笔记','Ctrl','K'],['创建命名分组','Ctrl','G'],['记下当前内容','Enter'],['编辑器内换行','Shift','Enter'],['加粗文字','Ctrl','B']].map(([label,...keys])=><div key={label}><span>{label}</span><span>{keys.map(key=><kbd key={key}>{key}</kbd>)}</span></div>)}</div></Dialog>}
    {modal?.type==='settings'&&<Dialog title="简单，刚刚好" subtitle="随记 0.1 · 你的笔记，留在你的电脑里。" onClose={()=>setModal(null)}><div className="setting-row"><div><h3>自动时间分组</h3><p>两条记录间隔达到 3 分钟，自动开始新的一组。</p></div><span className="setting-badge">3 分钟</span></div><div className="setting-row"><div><h3>自动保存</h3><p>记录与未完成的草稿都会保存，无需按保存按钮。</p></div><CheckCheck size={19}/></div><div className="setting-row"><div><h3>{info?.desktop?'本地数据位置':'当前为浏览器预览'}</h3><p className="data-path">{info?.dataDir}</p>{!info?.desktop&&<p>安装桌面版后可从 Windows 搜索打开，并支持 MCP。</p>}</div></div><div className="dialog-actions"><button className="button secondary" onClick={()=>setModal({type:'shortcuts'})}><Keyboard size={15}/>快捷键</button>{info?.desktop&&<button className="button primary" onClick={safely(()=>api.openData())}>打开数据文件夹</button>}</div></Dialog>}
    {modal?.type==='mcp'&&<Dialog title="把整理交给 Agent" subtitle="通过 MCP 连接，让想法慢慢变得有条理。" onClose={()=>setModal(null)} wide><div className="agent-feature"><span><Cable size={23}/></span><div><h3>你负责随手记，Agent 帮你整理</h3><p>搜索历史、提取线索、归类记录、创建分组。整理会保留原始记录的时间。</p></div></div>{info?.mcpConfig?<><p className="config-caption">将以下配置添加到支持 MCP 的客户端，然后重启该客户端。</p><pre className="config-code">{JSON.stringify(info.mcpConfig,null,2)}</pre><div className="mcp-note"><span className="tiny-dot"/>连接的是本机笔记，无需启动云服务。</div><div className="dialog-actions"><button className="button primary" onClick={safely(async()=>{await api.copy(JSON.stringify(info.mcpConfig,null,2));notify('MCP 配置已复制');})}><Copy size={15}/>复制配置</button></div></>:<div className="preview-notice"><p>当前为浏览器预览。桌面版提供本地 MCP 服务。</p><p>在项目目录运行 <code>npm run dev</code> 打开桌面版，即可复制连接配置。</p></div>}</Dialog>}
    {modal?.type==='image'&&<Dialog title={modal.alt||'图片预览'} onClose={()=>setModal(null)} wide><img className="image-preview" src={modal.src} alt={modal.alt}/></Dialog>}
    {editing&&<EditDialog entry={editing} onClose={()=>setEditing(null)} onSave={html=>mutate({type:'update_entry',noteId:editing.noteId,entryId:editing.id,html:safeHtml(html),expectedUpdatedAt:editing.updatedAt})} notify={notify}/>}
  </div>;
}

function EditDialog({ entry, onClose, onSave, notify }) {
  const editor = useRef(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const draftKey = `suiji-edit-${entry.id}`;
  return <Dialog title="编辑记录" subtitle="原始记录时间会保留。修改会自动暂存。" onClose={onClose} wide><Editor ref={editor} content={localStorage.getItem(draftKey)||entry.html} placeholder="编辑这条记录…" autofocus className="edit-dialog-editor" onChange={html=>{try{localStorage.setItem(draftKey,html);}catch{setError('暂存失败，请复制内容后重试');}}} onError={notify}/>{error&&<p className="inline-error">{error}</p>}<div className="dialog-actions"><button className="button secondary" onClick={()=>editor.current?.image()}><ImageIcon size={15}/>图片</button><button className="button secondary" onClick={onClose}>稍后继续</button><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);try{await onSave(editor.current.html());localStorage.removeItem(draftKey);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'正在保存…':'保存修改'}</button></div></Dialog>;
}
