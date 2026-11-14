import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileStore } from '../shared/store.mjs';

await fs.mkdir('.test-data',{recursive:true});await fs.mkdir('test-results',{recursive:true});
const dataDir=await fs.mkdtemp(path.resolve('.test-data/inline-ui-'));
const env={...process.env,SUIJI_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.SUIJI_DEV_URL;
let app,page;const errors=[];const store=new FileStore(dataDir);
const legacy=(await store.read()).notes.find(n=>n.title==='开始使用随记');
await store.mutate({type:'set_draft',noteId:legacy.id,html:'<p>旧版未提交的草稿，升级后保留。</p>'});
async function launch(){
  app=await electron.launch({args:['.',`--user-data-dir=${path.join(dataDir,'profile')}`],cwd:process.cwd(),env});
  await app.evaluate(({shell})=>{shell.openExternal=async()=>{};});
  page=await app.firstWindow();page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.message);});
  await page.locator('.note-title').waitFor();await page.locator('.note-canvas').waitFor();return page;
}
async function close(){const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;}
async function saved(){await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent.includes('已自动保存'));}
async function editorEnd(){await page.locator('.note-canvas').focus();await page.keyboard.press('Control+End');}
async function openNoteSearch(){const field=page.getByRole('textbox',{name:'笔记内搜索',exact:true});if(!await field.isVisible())await page.getByRole('button',{name:'查找当前笔记 Ctrl+F',exact:true}).click();await field.click();}
try{
  await launch();await page.waitForFunction(()=>document.activeElement?.classList.contains('note-canvas'));
  await page.locator('.note-canvas').getByText('旧版未提交的草稿，升级后保留。',{exact:true}).waitFor();await saved();assert.equal((await store.read()).notes.find(n=>n.id===legacy.id).draft,null);
  assert.equal(await page.locator('.composer,.view-toolbar,.filter-tabs,[role="dialog"]').count(),0);
  assert.equal(await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).count(),0);
  const top=await page.locator('.note-toolbar').boundingBox(),header=await page.locator('.topbar').boundingBox(),heading=await page.locator('.note-heading').boundingBox();assert.ok(Math.abs(top.y-header.y-header.height)<1);assert.ok(top.y+top.height<=heading.y+1);
  await page.screenshot({path:'test-results/inline-welcome.png'});
  await page.keyboard.press('Control+n');
  await page.waitForFunction(()=>document.querySelector('.note-title')?.value==='未命名笔记'&&document.activeElement===document.querySelector('.note-title'));
  await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('直接编辑验证');
  await editorEnd();await page.keyboard.insertText('第一段：记事本一样直接写。');await page.keyboard.press('Enter');await page.keyboard.insertText('第二段：今天研究 MCP。');
  await saved();let note=(await store.read()).notes.find(n=>n.title==='直接编辑验证');assert.equal(note.entries.length,2);assert.deepEqual(note.entries.map(e=>e.html),['<p>第一段：记事本一样直接写。</p>','<p>第二段：今天研究 MCP。</p>']);
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  const firstCreatedAt=note.entries[0].createdAt;
  await page.locator('.document-record').first().locator('p').click();await page.keyboard.press('Home');await page.keyboard.insertText('原地修改：');await saved();
  note=(await store.read()).notes.find(n=>n.id===note.id);assert.equal(note.entries[0].html,'<p>原地修改：第一段：记事本一样直接写。</p>');assert.equal(note.entries[0].createdAt,firstCreatedAt);
  await page.locator('.document-record').nth(1).locator('p').click();await page.keyboard.press('Home');await page.keyboard.press('Backspace');await saved();
  note=(await store.read()).notes.find(n=>n.id===note.id);assert.equal(note.entries.length,1);assert.equal(note.entries[0].html,'<p>原地修改：第一段：记事本一样直接写。第二段：今天研究 MCP。</p>');
  await page.keyboard.press('Control+z');await saved();note=(await store.read()).notes.find(n=>n.id===note.id);assert.equal(note.entries.length,2);
  console.log('PASS 单一正文直接输入、Enter 换行、原地编辑及自动保存');

  await editorEnd();await page.keyboard.press('Enter');await page.keyboard.insertText('查找目标 alpha，另一处 alpha。');await saved();
  const total=await page.locator('.document-record').count();
  await page.keyboard.press('Control+f');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='笔记内搜索');
  await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).fill('alpha');
  await page.waitForFunction(()=>document.querySelector('.match-counter')?.textContent==='1/2');assert.equal(await page.locator('.search-hit').count(),2);assert.equal(await page.locator('.document-record').count(),total);
  await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).press('Enter');await page.waitForFunction(()=>document.querySelector('.match-counter')?.textContent==='2/2');
  await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).press('Shift+Enter');await page.waitForFunction(()=>document.querySelector('.match-counter')?.textContent==='1/2');
  await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).fill('不存在的词');await page.waitForFunction(()=>document.querySelector('.match-counter')?.textContent==='0/0');assert.equal(await page.locator('.document-record').count(),total);
  await page.getByRole('button',{name:'清除笔记内搜索',exact:true}).click();
  console.log('PASS Ctrl+F 当前笔记查找、全文保留、匹配高亮和前后定位');

  await editorEnd();await page.keyboard.press('Enter');
  await page.locator('.note-document input[type="file"]').setInputFiles('assets/icon.png');await page.locator('.note-canvas img').waitFor();await saved();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'插入超链接',exact:true}).click();await page.getByRole('textbox',{name:'链接地址',exact:true}).fill('https://example.com');await page.getByRole('button',{name:'插入',exact:true}).click();await saved();
  await editorEnd();await page.keyboard.press('Enter');
  await page.locator('.note-canvas').evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','https://openai.com/');element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.locator('.note-canvas a[href="https://openai.com/"]').waitFor();await saved();
  const png=(await fs.readFile('assets/icon.png')).toString('base64');
  await page.locator('.note-canvas').evaluate((element,base64)=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},png);
  await page.waitForFunction(()=>document.querySelectorAll('.note-canvas img').length===2);await saved();
  console.log('PASS 图片和网址直接粘贴到笔记，网址立即成为超链接');
  await openNoteSearch();await page.getByRole('menuitem',{name:'图片 查看所有图片'}).click();await page.getByRole('region',{name:'图片筛选结果'}).waitFor();assert.equal(await page.locator('.image-result img').count(),2);assert.ok(await page.locator('.note-document').isHidden());
  await page.getByRole('button',{name:'定位原文',exact:true}).first().click();await page.locator('.note-canvas').waitFor();assert.equal(await page.locator('.media-results').count(),0);
  await openNoteSearch();await page.getByRole('menuitem',{name:'超链接 查看所有链接'}).click();await page.getByRole('region',{name:'超链接筛选结果'}).waitFor();assert.equal(await page.locator('.link-result a').count(),2);
  await page.getByRole('button',{name:'返回笔记',exact:false}).click();
  console.log('PASS 工具栏插图与超链接、搜索下拉筛选、结果定位回原文');

  await editorEnd();await page.keyboard.press('Enter');await page.keyboard.insertText('准备分组的这一行。');const beforeGrouping=await page.locator('.document-record').count();await page.keyboard.press('Control+g');const groupTitle=page.getByRole('textbox',{name:'分组名称',exact:true});await groupTitle.waitFor();await groupTitle.fill('灵感收集');await groupTitle.press('Enter');await page.waitForFunction(()=>document.activeElement?.classList.contains('note-canvas'));await page.keyboard.insertText('在分组块里直接写。');await saved();assert.equal(await page.locator('.document-record').count(),beforeGrouping);
  assert.ok((await page.locator('.document-group').textContent()).includes('在分组块里直接写。'));assert.equal(await page.locator('[role="dialog"]').count(),0);
  await page.getByRole('button',{name:'时间分组',exact:true}).click();
  if(await page.getByRole('button',{name:'时间分组',exact:true}).getAttribute('aria-pressed')==='false')await page.getByRole('button',{name:'时间分组',exact:true}).click();
  await page.locator('.document-time-heading').first().waitFor();await page.getByRole('button',{name:'时间分组',exact:true}).click();assert.equal(await page.locator('.document-time-heading').count(),0);
  const toolbar=await page.locator('.note-toolbar').boundingBox(),title=await page.locator('.note-heading').boundingBox(),topbar=await page.locator('.topbar').boundingBox();assert.ok(toolbar.y+toolbar.height<=title.y+1);assert.ok(Math.abs(toolbar.y-topbar.y-topbar.height)<1);
  console.log('PASS 直接插入和编辑命名分组、时间分组收进顶部工具栏');

  note=(await store.read()).notes.find(n=>n.title==='直接编辑验证');
  await store.mutate({type:'append_entry',noteId:note.id,html:'<p>Agent 实时新增的段落。</p>'});await page.locator('.note-canvas').getByText('Agent 实时新增的段落。',{exact:true}).waitFor();
  await page.keyboard.press('Control+k');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='搜索所有笔记');await page.getByRole('textbox',{name:'搜索所有笔记',exact:true}).fill('开始使用');assert.equal(await page.locator('.note-list .note-item').count(),1);await page.getByRole('button',{name:'清空全局搜索',exact:true}).click();
  console.log('PASS Agent 新内容实时同步，全局搜索只影响笔记列表');

  await editorEnd();await page.keyboard.press('Enter');await page.keyboard.insertText('关闭前最后一行，无需发送或保存。');await close();
  note=(await store.read()).notes.find(n=>n.title==='直接编辑验证');assert.ok(note.entries.some(e=>e.html.includes('关闭前最后一行')));assert.equal(note.draft,null);assert.ok(note.entries.some(e=>e.html.includes('<img')));assert.equal(note.groups[0].title,'灵感收集');
  await launch();await page.locator('.note-canvas').getByText('关闭前最后一行，无需发送或保存。',{exact:true}).waitFor();assert.equal(await page.locator('.note-canvas img').count(),2);
  await page.screenshot({path:'test-results/inline-desktop.png'});await page.setViewportSize({width:800,height:650});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'test-results/inline-compact.png'});
  assert.deepEqual(errors,[]);await close();
  console.log('PASS 实际关闭恢复正文、图片和分组，紧凑窗口无横向溢出，无界面异常');
}catch(error){console.error(error);process.exitCode=1;if(page&&!page.isClosed())try{await page.screenshot({path:'test-results/inline-failure.png'});}catch{}}
finally{if(app)try{await app.close();}catch{}}
