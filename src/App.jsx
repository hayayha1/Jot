import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, SquarePen, Search, X, Plus, Image as ImageIcon, Link2, Clock3, Pin, PinOff, MoreHorizontal, ChevronDown, ChevronRight, Check, CheckCheck, FolderPlus, Settings2, PanelLeftClose, PanelLeftOpen, Download, Archive, Bold, List, Code2, Keyboard, Cable, LoaderCircle, AlertCircle, ArrowUp, ArrowDown, Undo2, Redo2, CornerDownRight, ExternalLink } from 'lucide-react';
import Editor from './Editor';
import { api } from './api';
import { hasImage, matchesEntry, plainText } from '../shared/model.mjs';
import { exportHtml } from './rich';
import { mediaFromSnapshot } from './document-model';

const time=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
function dayLabel(value){
  const date=new Date(value),today=new Date();today.setHours(0,0,0,0);
  const day=new Date(date);day.setHours(0,0,0,0);
  const delta=Math.round((today-day)/86400000);
  return delta===0?'今天':delta===1?'昨天':date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
}
function IconButton({icon:Icon,title,className='',preserveFocus=false,...props}){
  return <button className={`icon-button ${className}`} title={title} aria-label={title} onMouseDown={preserveFocus?event=>event.preventDefault():undefined} {...props}><Icon size={16} strokeWidth={1.7}/></button>;
}

export default function App(){
  const [state,setState]=useState(null),[activeId,setActiveId]=useState(()=>localStorage.getItem('suiji-active-note'));
  const [globalQuery,setGlobalQuery]=useState(''),[localQuery,setLocalQuery]=useState(''),[contentFilter,setContentFilter]=useState('all');
  const [matchIndex,setMatchIndex]=useState(0),[matchCount,setMatchCount]=useState(0),[searchOpen,setSearchOpen]=useState(false);
  const [searchVisible,setSearchVisible]=useState(false);
  const [mode,setMode]=useState(()=>localStorage.getItem('suiji-view') || 'plain');
  const [sidebar,setSidebar]=useState(true),[archived,setArchived]=useState(false),[sort,setSort]=useState('updatedAt');
  const [panel,setPanel]=useState(null),[noteMenu,setNoteMenu]=useState(false),[linkOpen,setLinkOpen]=useState(false),[linkUrl,setLinkUrl]=useState(''),[linkError,setLinkError]=useState('');
  const [info,setInfo]=useState(null),[status,setStatus]=useState('saved'),[failure,setFailure]=useState(''),[toast,setToast]=useState(null);
  const [live,setLive]=useState(null),[format,setFormat]=useState({});
  const stateRef=useRef(),current=useRef(),actions=useRef(),documentApi=useRef(),titleInput=useRef(),globalSearch=useRef(),noteSearch=useRef(),searchWrap=useRef(),focusTitle=useRef();
  const note=state?.notes.find(n=>n.id===activeId);
  current.current=note;
  const snapshot=live&&note&&live.noteId===note.id?live:{entries:note?.entries || [],groups:note?.groups || []};
  const media=useMemo(()=>contentFilter==='all'?[]:mediaFromSnapshot(snapshot,contentFilter),[snapshot,contentFilter]);
  const words=snapshot.entries.reduce((count,entry)=>count+plainText(entry.html).replace(/\s/g,'').length,0);

  function acceptState(next){if(!stateRef.current||next.revision>=stateRef.current.revision){stateRef.current=next;setState(next);}}
  function report(message){setFailure(message);setStatus('error');}
  function notify(text){setToast(text);}
  function saveStatus(next){setStatus(next);if(next==='saved')setFailure('');}
  async function mutate(command){
    try{const response=await api.mutate(command);acceptState(response.state);return response;}
    catch(error){report(error.message);throw error;}
  }
  const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(error=>report(error.message));
  async function saveTitle(){
    const n=current.current,value=titleInput.current?.value;
    if(n&&typeof value==='string'&&value.trim()!==n.title){const response=await mutate({type:'rename_note',noteId:n.id,title:value});if(titleInput.current)titleInput.current.value=response.state.notes.find(item=>item.id===n.id).title;}
  }
  async function flush(){await documentApi.current?.flush();await saveTitle();}
  async function selectNote(noteId){if(noteId===activeId)return;await flush();setActiveId(noteId);}
  async function newNote(){
    await flush();const {result}=await mutate({type:'create_note',title:'未命名笔记'});
    focusTitle.current=result.noteId;setArchived(false);setGlobalQuery('');setActiveId(result.noteId);
  }
  function resetSearch(){setLocalQuery('');setMatchIndex(0);setContentFilter('all');setSearchOpen(false);setSearchVisible(false);}
  function newGroup(){resetSearch();if(contentFilter==='all')documentApi.current?.newGroup();else requestAnimationFrame(()=>documentApi.current?.newGroup());}
  function locate(entryId){setContentFilter('all');setSearchOpen(false);requestAnimationFrame(()=>documentApi.current?.locate(entryId));}
  async function archiveNote(){
    await flush();const n=current.current;await mutate({type:'archive_note',noteId:n.id,archived:!n.archived});setNoteMenu(false);
    setActiveId(stateRef.current.notes.find(item=>item.id!==n.id&&item.archived===archived)?.id || null);notify(n.archived?'笔记已恢复':'笔记已归档');
  }
  async function exportNote(){await flush();const n=stateRef.current.notes.find(item=>item.id===activeId);if(await api.export({title:n.title,content:exportHtml(n)}))notify('笔记已导出，图片也已保留');setNoteMenu(false);}
  function onEditorReady(){
    if(focusTitle.current===current.current?.id){focusTitle.current=null;titleInput.current?.focus();titleInput.current?.select();}
    else if(!document.activeElement?.closest('.search-box'))documentApi.current?.focus();
  }
  actions.current={newNote,newGroup,flush,focusSearch:()=>{if(!current.current)return;setSearchVisible(true);setSearchOpen(true);requestAnimationFrame(()=>{noteSearch.current?.focus();noteSearch.current?.select();});}};

  useEffect(()=>{
    api.read().then(next=>{
      acceptState(next);setActiveId(previous=>next.notes.some(n=>n.id===previous&&!n.archived)?previous:next.notes.find(n=>n.title==='开始使用随记'&&!n.archived)?.id || next.notes.find(n=>!n.archived)?.id || null);
    }).catch(error=>report(error.message));
    api.info().then(setInfo).catch(error=>report(error.message));
    const interval=setInterval(()=>api.read().then(acceptState).catch(error=>report(error.message)),1600);
    const openLink=event=>api.openLink(event.detail).catch(error=>report(error.message));window.addEventListener('suiji:open-link',openLink);
    window.suijiFlush=()=>actions.current.flush();
    return()=>{clearInterval(interval);window.removeEventListener('suiji:open-link',openLink);delete window.suijiFlush;};
  },[]);
  useEffect(()=>{
    if(activeId)localStorage.setItem('suiji-active-note',activeId);
    resetSearch();setNoteMenu(false);setLinkOpen(false);setFailure('');setStatus('saved');
  },[activeId]);
  useEffect(()=>{if(titleInput.current&&document.activeElement!==titleInput.current)titleInput.current.value=note?.title || '';},[note?.title,note?.id]);
  useEffect(()=>{localStorage.setItem('suiji-view',mode);},[mode]);
  useEffect(()=>{if(toast){const timeout=setTimeout(()=>setToast(null),3500);return()=>clearTimeout(timeout);}},[toast]);
  useEffect(()=>{
    const outside=event=>{
      if(!searchWrap.current?.contains(event.target)){setSearchOpen(false);setSearchVisible(false);}
      if(!event.target.closest('[data-popover]')){setPanel(null);setNoteMenu(false);setLinkOpen(false);}
    };
    const shortcuts=event=>{
      if(event.key==='Escape'){setPanel(null);setNoteMenu(false);setLinkOpen(false);setSearchOpen(false);if(document.activeElement===noteSearch.current){resetSearch();documentApi.current?.focus();}return;}
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key==='f'){event.preventDefault();actions.current.focusSearch();}
      if(key==='k'){event.preventDefault();setSearchVisible(false);setSearchOpen(false);setSidebar(true);requestAnimationFrame(()=>globalSearch.current?.focus());}
      if(key==='n'){event.preventDefault();safe(()=>actions.current.newNote())();}
      if(key==='g'&&current.current&&!current.current.archived){event.preventDefault();actions.current.newGroup();}
      if(key==='s'){event.preventDefault();safe(()=>actions.current.flush())();}
    };
    window.addEventListener('pointerdown',outside);window.addEventListener('keydown',shortcuts);
    return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',shortcuts);};
  },[]);
  const visibleNotes=useMemo(()=>(state?.notes || []).filter(n=>n.archived===archived&&(!globalQuery.trim()||n.title.toLocaleLowerCase().includes(globalQuery.trim().toLocaleLowerCase())||n.entries.some(entry=>matchesEntry(entry,globalQuery)))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b[sort]-a[sort]),[state,archived,globalQuery,sort]);

  if(!state)return <div className="loading"><BookOpen size={35}/><p>{failure || '正在打开随记…'}</p>{failure&&<button className="button secondary" onClick={()=>location.reload()}>重试</button>}</div>;

  return <div className={`app ${sidebar?'':'sidebar-hidden'}`}>
    {sidebar&&<aside className="sidebar">
      <div className="brand-row"><div className="brand"><span className="brand-icon"><BookOpen size={22} strokeWidth={1.6}/></span><span>随记<span className="brand-period">.</span></span></div><IconButton icon={SquarePen} title="新建笔记 Ctrl+N" onClick={safe(newNote)}/></div>
      <div className="search-box"><Search size={15}/><input ref={globalSearch} aria-label="搜索所有笔记" placeholder="搜索所有笔记…" value={globalQuery} onChange={event=>setGlobalQuery(event.target.value)}/>{globalQuery?<IconButton icon={X} title="清空全局搜索" onClick={()=>setGlobalQuery('')}/>:<kbd>Ctrl K</kbd>}</div>
      <div className="list-heading"><button onClick={safe(async()=>{await flush();setArchived(!archived);setGlobalQuery('');setActiveId(stateRef.current.notes.find(n=>n.archived!==archived)?.id || null);})}>{archived?'归档笔记':'我的笔记'}<ChevronDown size={12}/></button><button title="切换笔记排列顺序" onClick={()=>setSort(sort==='updatedAt'?'createdAt':'updatedAt')}><Clock3 size={12}/><span>{sort==='updatedAt'?'最近编辑':'最近创建'}</span></button></div>
      <div className="note-list">{visibleNotes.map(n=>{
        const last=n.entries.findLast(entry=>plainText(entry.html)||hasImage(entry.html));
        return <button key={n.id} className={`note-item ${n.id===activeId?'selected':''}`} onClick={safe(()=>selectNote(n.id))}><div className="note-item-title"><span>{n.title}</span>{n.pinned?<Pin size={12}/>:<span className="note-dot"/>}</div><p>{hasImage(last?.html || '')&&<ImageIcon size={12}/>}<span>{plainText(n.draft?.html || last?.html || '') || '还没有内容，写下第一笔吧'}</span></p><div className="note-item-meta"><span>{dayLabel(n.updatedAt)} {time(n.updatedAt)}</span><span>{n.entries.filter(entry=>plainText(entry.html)||hasImage(entry.html)).length} 条记录</span></div></button>;
      })}{!visibleNotes.length&&<div className="list-empty"><Search size={24}/><p>{globalQuery?'没有找到相关笔记':archived?'还没有归档的笔记':'从一篇新笔记开始'}</p>{globalQuery&&<button onClick={()=>setGlobalQuery('')}>清空搜索</button>}</div>}</div>
      <button className="new-note" onClick={safe(newNote)}><Plus size={16}/><span>新建笔记</span><kbd>Ctrl N</kbd></button>
      <div className="sidebar-footer"><span><i/>{info?.desktop?'本地笔记':'浏览器预览'}</span><div data-popover><IconButton icon={Settings2} title="偏好设置" onClick={()=>setPanel(panel==='settings'?null:'settings')}/></div></div>
    </aside>}
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb"><IconButton icon={sidebar?PanelLeftClose:PanelLeftOpen} title={sidebar?'收起笔记列表':'展开笔记列表'} onClick={()=>setSidebar(!sidebar)}/><span>{archived?'归档':'我的笔记'}</span>{note&&<><ChevronRight size={12}/><span className="breadcrumb-title">{note.title}</span></>}</div><div className="topbar-actions" data-popover><button className="mcp-button" onClick={()=>setPanel(panel==='mcp'?null:'mcp')}><Cable size={15}/><span>连接 Agent</span></button><span className="topbar-divider"/><IconButton icon={Keyboard} title="快捷键" onClick={()=>setPanel(panel==='shortcuts'?null:'shortcuts')}/></div></header>
        <div className="note-toolbar" role="toolbar" aria-label="笔记工具栏">
          <div className="format-tools">
            <IconButton preserveFocus icon={ImageIcon} title="插入图片" disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.image()}/>
            <div className="link-tool" data-popover><IconButton preserveFocus icon={Link2} title="插入超链接" disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>{setLinkOpen(!linkOpen);setLinkError('');}}/>{linkOpen&&<form className="link-popover" onSubmit={event=>{event.preventDefault();try{const url=new URL(linkUrl);if(!['https:','http:','mailto:'].includes(url.protocol))throw new Error();documentApi.current?.link(url.href);setLinkOpen(false);setLinkUrl('');}catch{setLinkError('请输入有效的网页或邮件地址');}}}><label htmlFor="insert-link">插入超链接</label><div><input id="insert-link" aria-label="链接地址" placeholder="https://" value={linkUrl} onChange={event=>setLinkUrl(event.target.value)} autoFocus/><button className="button primary">插入</button></div>{linkError&&<p className="inline-error">{linkError}</p>}</form>}</div>
            <span className="tool-divider"/>
            <IconButton preserveFocus icon={Bold} title="加粗 Ctrl+B" className={format.bold?'active':''} disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.bold()}/>
            <IconButton preserveFocus icon={List} title="项目列表" className={format.list?'active':''} disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.list()}/>
            <IconButton preserveFocus icon={Code2} title="代码块" className={`optional-tool ${format.code?'active':''}`} disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.code()}/>
            <IconButton preserveFocus icon={Undo2} title="撤销 Ctrl+Z" className="optional-tool" disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.undo()}/>
            <IconButton preserveFocus icon={Redo2} title="重做 Ctrl+Y" className="optional-tool" disabled={!note||note.archived||contentFilter!=='all'} onClick={()=>documentApi.current?.redo()}/>
            <span className="tool-divider"/>
            <button className="toolbar-label-button" title="新建命名分组 Ctrl+G" aria-label="新建命名分组" disabled={!note||note.archived} onMouseDown={event=>event.preventDefault()} onClick={newGroup}><FolderPlus size={15}/><span>分组</span></button>
            <button className={`toolbar-label-button ${mode==='time'?'active':''}`} title="间隔 3 分钟自动分组" aria-label="时间分组" disabled={!note} aria-pressed={mode==='time'} onClick={()=>setMode(mode==='time'?'plain':'time')}><Clock3 size={15}/><span>时间分组</span></button>
          </div>
          <div className={`note-search ${contentFilter!=='all'?'has-filter':''}`} ref={searchWrap} data-popover>
            <IconButton icon={Search} title="查找当前笔记 Ctrl+F" className={searchVisible||localQuery||contentFilter!=='all'?'active':''} disabled={!note} aria-expanded={searchVisible} onClick={()=>{if(searchVisible){setSearchVisible(false);}else actions.current.focusSearch();}}/>
            {searchVisible&&<div className="note-search-popover">
              <div className="note-search-field"><Search size={14}/><input ref={noteSearch} aria-label="笔记内搜索" placeholder={contentFilter==='image'?'正在筛选图片':contentFilter==='link'?'正在筛选超链接':'查找当前笔记…'} value={localQuery} onFocus={()=>setSearchOpen(true)} onClick={()=>setSearchOpen(true)} onChange={event=>{setLocalQuery(event.target.value);setContentFilter('all');setMatchIndex(0);setSearchOpen(false);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setSearchOpen(false);setMatchIndex(index=>matchCount?(index+(event.shiftKey?-1:1)+matchCount)%matchCount:0);}}}/>{localQuery?<><span className="match-counter" aria-live="polite">{matchCount?matchIndex+1:0}/{matchCount}</span><IconButton icon={ArrowUp} title="上一处 Shift+Enter" disabled={!matchCount} onClick={()=>setMatchIndex(index=>(index-1+matchCount)%matchCount)}/><IconButton icon={ArrowDown} title="下一处 Enter" disabled={!matchCount} onClick={()=>setMatchIndex(index=>(index+1)%matchCount)}/></>:contentFilter==='all'?<kbd>Ctrl F</kbd>:<span className="media-count">{media.length}</span>}{(localQuery||contentFilter!=='all')&&<IconButton icon={X} title="清除笔记内搜索" onClick={resetSearch}/>}</div>
              {searchOpen&&<div className="note-search-dropdown" role="menu" aria-label="笔记内筛选"><p>筛选当前笔记</p><button role="menuitem" onClick={()=>{setContentFilter('image');setLocalQuery('');setMatchIndex(0);setSearchOpen(false);setSearchVisible(false);}}><ImageIcon size={15}/><span>图片</span><span>查看所有图片</span></button><button role="menuitem" onClick={()=>{setContentFilter('link');setLocalQuery('');setMatchIndex(0);setSearchOpen(false);setSearchVisible(false);}}><Link2 size={15}/><span>超链接</span><span>查看所有链接</span></button></div>}
            </div>}
          </div>
        </div>


      {note?<>
        <div className="note-heading"><div className="note-heading-main"><div className="eyebrow"><i/>{note.archived?'已归档':'给想法一个落脚的地方'}</div><input ref={titleInput} key={`${note.id}-title`} className="note-title" aria-label="笔记标题" defaultValue={note.title} maxLength={200} onBlur={safe(saveTitle)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();documentApi.current?.focus();}}}/><div className="note-subtitle"><span>{new Date(note.createdAt).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})}</span><span>·</span><span>{words.toLocaleString()} 字</span></div></div><div className="heading-actions"><IconButton icon={note.pinned?PinOff:Pin} title={note.pinned?'取消置顶':'置顶笔记'} className={note.pinned?'active':''} onClick={safe(()=>mutate({type:'pin_note',noteId:note.id,pinned:!note.pinned}))}/><div className="menu-wrap" data-popover><IconButton icon={MoreHorizontal} title="笔记操作" onClick={()=>setNoteMenu(!noteMenu)}/>{noteMenu&&<div className="dropdown note-menu"><button onClick={safe(exportNote)}><Download size={15}/>导出笔记<span>HTML</span></button><button onClick={safe(archiveNote)}><Archive size={15}/>{note.archived?'恢复笔记':'归档笔记'}</button></div>}</div></div></div>
        <div className="document-scroll" onMouseDown={event=>{if(contentFilter==='all'&&event.target===event.currentTarget){event.preventDefault();documentApi.current?.focus();}}}>
          <Editor ref={documentApi} key={note.id} note={note} mode={mode} query={localQuery} matchIndex={matchIndex} filtered={contentFilter!=='all'} onSave={mutate} onSnapshot={next=>setLive({noteId:note.id,...next})} onStatus={saveStatus} onError={report} onSearchState={({count,index})=>{setMatchCount(count);setMatchIndex(index);}} onFormat={setFormat} onReady={onEditorReady}/>
          {contentFilter!=='all'&&<section className="media-results" aria-label={contentFilter==='image'?'图片筛选结果':'超链接筛选结果'}><div className="media-results-heading"><div>{contentFilter==='image'?<ImageIcon size={17}/>:<Link2 size={17}/>}<h2>{contentFilter==='image'?'笔记中的图片':'笔记中的超链接'}</h2><span>{media.length} 个</span></div><button onClick={resetSearch}>返回笔记 <CornerDownRight size={13}/></button></div>{!media.length?<div className="media-empty">这篇笔记里还没有{contentFilter==='image'?'图片':'超链接'}。</div>:<div className={contentFilter==='image'?'image-grid':'link-results'}>{media.map(item=>contentFilter==='image'?<article key={item.id} className="image-result"><button className="image-result-preview" onClick={()=>locate(item.entryId)} title="定位到笔记中的图片"><img src={item.src} alt={item.alt}/></button><div><span>{item.alt}</span><button onClick={()=>locate(item.entryId)}>定位原文<CornerDownRight size={12}/></button></div></article>:<article key={item.id} className="link-result"><span className="link-result-icon"><Link2 size={17}/></span><div><a href={item.href} onClick={event=>{event.preventDefault();safe(()=>api.openLink(item.href))();}}>{item.label || item.href}<ExternalLink size={11}/></a><p>{item.href}</p></div><button onClick={()=>locate(item.entryId)}>定位原文<CornerDownRight size={12}/></button></article>)}</div>}</section>}
        </div>
        <footer className="document-footer"><span>{contentFilter!=='all'?'筛选仅改变显示，原文完整保留':localQuery?(matchCount?'Enter 下一处 · Shift + Enter 上一处':'没有找到匹配内容'):'直接编辑 · Enter 换行 · Ctrl + F 查找'}</span><span className={`save-status ${status}`}>{status==='saving'?<LoaderCircle size={12} className="spin"/>:status==='error'?<AlertCircle size={12}/>:<CheckCheck size={13}/>} {status==='saving'?'正在保存':status==='error'?'保存失败':'已自动保存'}</span></footer>
        {note.archived&&<div className="archived-notice"><Archive size={15}/>这篇笔记已归档<button onClick={safe(archiveNote)}>恢复笔记</button></div>}
      </>:<div className="no-note"><BookOpen size={40}/><h2>留一点空白，装下生活。</h2><p>选一篇笔记，或开始新的记录。</p><button className="button primary" onClick={safe(newNote)}><Plus size={15}/>新建笔记</button></div>}
      {failure&&<div className="error-banner" role="alert"><AlertCircle size={15}/><span>{failure}</span><button onClick={()=>setFailure('')} aria-label="关闭错误提示"><X size={14}/></button></div>}
      {panel&&<section className="utility-panel" data-popover aria-label={panel==='mcp'?'连接 Agent':panel==='settings'?'偏好设置':'快捷键'}><div className="panel-heading"><h2>{panel==='mcp'?'把整理交给 Agent':panel==='settings'?'简单，刚刚好':'让记录更顺手'}</h2><IconButton icon={X} title="关闭面板" onClick={()=>setPanel(null)}/></div>
        {panel==='mcp'?<><p className="panel-description">复制配置到支持 MCP 的客户端，连接本机笔记。</p>{info?.mcpConfig?<><pre className="config-code">{JSON.stringify(info.mcpConfig,null,2)}</pre><button className="button primary" onClick={safe(async()=>{await api.copy(JSON.stringify(info.mcpConfig,null,2));notify('MCP 配置已复制');})}>复制配置</button></>:<p className="panel-description">浏览器预览不提供本地 MCP。运行桌面版后，可在这里复制连接配置。</p>}</>:panel==='shortcuts'?<div className="shortcut-list">{[['新建笔记','Ctrl','N'],['搜索所有笔记','Ctrl','K'],['笔记内查找','Ctrl','F'],['插入命名分组','Ctrl','G'],['下一处匹配','Enter'],['上一处匹配','Shift','Enter'],['换行','Enter'],['撤销','Ctrl','Z'],['加粗','Ctrl','B']].map(([label,...keys])=><div key={label}><span>{label}</span><span>{keys.map(key=><kbd key={key}>{key}</kbd>)}</span></div>)}</div>:<><p className="panel-description">随记 {info?.version} · 你的笔记，留在你的电脑里。</p><div className="setting-row"><h3>自动保存</h3><p>直接编辑即可，关闭前会完成最后一次保存。</p></div><div className="setting-row"><h3>时间分组</h3><p>从工具栏切换。停写 3 分钟，或日期改变时显示新的时间组。</p></div><div className="setting-row"><h3>数据位置</h3><p className="data-path">{info?.dataDir}</p></div>{info?.desktop&&<button className="button secondary" onClick={safe(()=>api.openData())}>打开数据文件夹</button>}</>}
      </section>}
    </main>
    {toast&&<div className="toast" role="status"><Check size={14}/><span>{toast}</span><IconButton icon={X} title="关闭提示" onClick={()=>setToast(null)}/></div>}
  </div>;
}
