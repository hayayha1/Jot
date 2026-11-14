import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileStore } from '../shared/store.mjs';

await fs.mkdir('.test-data',{recursive:true});await fs.mkdir('test-results',{recursive:true});
const dataDir=await fs.mkdtemp(path.resolve('.test-data/regressions-'));
const env={...process.env,SUIJI_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.SUIJI_DEV_URL;
const store=new FileStore(dataDir);const errors=[];let app,page;
async function launch(){
  app=await electron.launch({args:['.',`--user-data-dir=${path.join(dataDir,'profile')}`],cwd:process.cwd(),env});
  page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({shell})=>{globalThis.__suijiOpened=[];shell.openExternal=async url=>{globalThis.__suijiOpened.push(url);};});
  await page.locator('.note-canvas').waitFor();
}
async function close(){const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;}
async function saved(){await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent.includes('已自动保存'));}
async function chrome(){return page.evaluate(()=>Object.fromEntries(['.sidebar','.topbar','.note-toolbar','.note-heading','.document-footer'].map(selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return [selector,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];})));}
async function stationary(before){
  const after=await chrome();for(const key of Object.keys(before))for(const dimension of ['x','y','width','height'])assert.ok(Math.abs(before[key][dimension]-after[key][dimension])<1,`${key} ${dimension} moved`);
  assert.equal(await page.evaluate(()=>window.scrollY),0);assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
}
try{
  await launch();await page.waitForFunction(()=>document.activeElement?.classList.contains('note-canvas'));
  await page.keyboard.press('Control+n');await page.waitForFunction(()=>document.querySelector('.note-title')?.value==='未命名笔记'&&document.activeElement===document.querySelector('.note-title'));
  await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('滚动与分组回归验证');
  const canvas=page.locator('.note-canvas');await canvas.click();
  assert.equal(await page.locator('.document-record').count(),1);assert.ok((await canvas.boundingBox()).height<=35);
  const viewport=await page.locator('.document-scroll').boundingBox();await page.mouse.click(viewport.x+80,viewport.y+viewport.height-35);
  await page.waitForFunction(()=>document.activeElement?.classList.contains('note-canvas'));await page.keyboard.insertText('第一行，空白区域点击后仍从这一行编辑。');await saved();
  assert.equal(await page.locator('.document-record').count(),1);
  console.log('PASS 新笔记只有一行，点击下方空白不会产生任意高度的输入区');

  await page.keyboard.press('Enter');await canvas.evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','https://example.com/default-browser');element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.locator('.note-canvas a[href="https://example.com/default-browser"]').click();
  const deadline=Date.now()+3000;let opened=[];while(Date.now()<deadline){opened=await app.evaluate(()=>globalThis.__suijiOpened);if(opened.length)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.deepEqual(opened,['https://example.com/default-browser']);assert.ok(page.url().startsWith('file:'));assert.equal(app.windows().length,1);
  console.log('PASS 普通单击链接经系统 openExternal 打开，无需 Ctrl，笔记窗口不跳转');

  const fixed=await chrome();await canvas.focus();await page.keyboard.press('Control+End');
  for(let line=3;line<=72;line++){await page.keyboard.press('Enter');await page.keyboard.insertText(`第${String(line).padStart(3,'0')}行：连续换行扩展正文。`);}
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');await saved();
  assert.equal(await page.locator('.document-record').count(),74);
  assert.equal(await page.locator('.note-canvas a').count(),1,'后续换行不能继承之前网址的链接格式');
  const scroll=await page.locator('.document-scroll').evaluate(element=>({top:element.scrollTop,height:element.clientHeight,total:element.scrollHeight}));assert.ok(scroll.total>scroll.height);assert.ok(scroll.top>0);await stationary(fixed);
  const box=await page.locator('.document-scroll').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,10000);await page.waitForTimeout(120);await stationary(fixed);
  await page.mouse.wheel(0,-10000);await page.waitForTimeout(120);await stationary(fixed);
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight+1),true);
  console.log('PASS 74 行扩展、光标自动跟随、滚轮到底/顶，只有正文滚动，外层页面固定');

  await page.keyboard.press('Control+f');await page.getByRole('textbox',{name:'笔记内搜索',exact:true}).fill('第010行');
  await page.waitForFunction(()=>{const hit=document.querySelector('.search-hit-active'),viewport=document.querySelector('.document-scroll').getBoundingClientRect();if(!hit)return false;const rect=hit.getBoundingClientRect();return rect.top>=viewport.top&&rect.bottom<=viewport.bottom;});await stationary(fixed);await page.keyboard.press('Escape');
  const row=page.locator('.document-record').nth(20),rowId=await row.getAttribute('data-record-id'),original=await row.innerText();
  let note=(await store.read()).notes.find(n=>n.title==='滚动与分组回归验证');const createdAt=note.entries.find(entry=>entry.id===rowId).createdAt;
  await row.locator('p').click();await page.keyboard.press('Home');for(let n=0;n<5;n++)await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'新建命名分组',exact:true}).click();const title=page.getByRole('textbox',{name:'分组名称',exact:true});await title.waitFor();await title.fill('原地分组');await title.press('Enter');
  assert.equal(await page.locator('.document-record').count(),74);assert.equal(await page.locator('.document-group .document-record').count(),1);assert.equal(await page.locator('.document-group .document-record').getAttribute('data-record-id'),rowId);assert.equal(await page.locator('.document-group .document-record').innerText(),original);
  await page.keyboard.insertText('【组内】');await saved();note=(await store.read()).notes.find(n=>n.id===note.id);
  const grouped=note.entries.find(entry=>entry.id===rowId);assert.equal(grouped.createdAt,createdAt);assert.equal(grouped.groupId,note.groups[0].id);assert.ok(grouped.html.includes(original.slice(0,5)+'【组内】'+original.slice(5)));assert.equal(note.entries.length,74);await stationary(fixed);
  console.log('PASS 分组包住光标所在行，保留 ID、内容、时间和插入位置，不新增空行');

  await page.setViewportSize({width:800,height:600});const compact=await chrome();await canvas.focus();await page.keyboard.press('Control+End');await stationary(compact);await page.screenshot({path:'test-results/scroll-fixed.png'});
  await close();await launch();assert.equal(await page.locator('.document-record').count(),74);assert.equal(await page.locator('.document-group').count(),1);assert.ok((await page.locator('.document-group').innerText()).includes('【组内】'));assert.deepEqual(errors,[]);await close();
  console.log('PASS 紧凑窗口布局固定，关闭重启后保留所有行、末尾空行和原地分组');
}catch(error){console.error(error);process.exitCode=1;if(page&&!page.isClosed())try{await page.screenshot({path:'test-results/regression-failure.png'});}catch{}}
finally{if(app)try{await app.close();}catch{}}
