import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileStore } from '../shared/store.mjs';

await fs.mkdir('.test-data', { recursive: true });
await fs.mkdir('test-results', { recursive: true });
const dataDir = await fs.mkdtemp(path.resolve('.test-data/ui-'));
const env = { ...process.env, SUIJI_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE; delete env.SUIJI_DEV_URL;
let app;
const errors = [];
async function launch() {
  app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(dataDir, 'profile')}`], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.note-title').waitFor();
  return page;
}
async function untilSaved(page) { await page.waitForFunction(() => document.querySelector('.save-status')?.textContent.includes('已自动保存')); }
async function closeNormally(page) {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  await closed;
}
try {
  let page = await launch();
  assert.equal(await page.title(), '随记');
  await page.screenshot({ path: 'test-results/welcome.png' });
  await page.keyboard.press('Control+n');
  await page.waitForFunction(()=>document.querySelector('.note-title')?.value==='未命名笔记'&&document.activeElement===document.querySelector('.note-title'));
  const title = page.getByRole('textbox', { name: '笔记标题', exact: true });
  await title.fill('桌面验证笔记');
  const composer = page.locator('.composer [contenteditable="true"]');
  await composer.click();
  await page.waitForFunction(()=>document.querySelector('.breadcrumb-title')?.textContent==='桌面验证笔记');
  await composer.fill('第一条想法：轻一点，随时记。'); await composer.press('Enter');
  await page.locator('.entry-body').getByText('第一条想法：轻一点，随时记。', { exact: true }).waitFor();
  assert.equal(await page.locator('.entry').count(),1);
  console.log('PASS 新建笔记、改名、中文输入、Enter 记录');

  await composer.fill('https://example.com'); await composer.press('Enter');
  await page.locator('.entry-body a[href="https://example.com"]').waitFor();
  await composer.fill('中文输入法');
  await composer.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:229, isComposing:true, bubbles:true })));
  assert.equal(await page.locator('.entry').count(),2);
  await composer.fill('多行记录'); await composer.press('Shift+Enter'); await composer.pressSequentially('第二行');
  assert.equal(await page.locator('.entry').count(),2);
  await composer.press('Enter');
  await page.locator('.entry-body').getByText('多行记录', { exact:false }).first().waitFor();
  console.log('PASS 自动链接、输入法回车、Shift+Enter 换行');

  await page.locator('.composer input[type="file"]').setInputFiles('assets/icon.png');
  await page.locator('.composer .tiptap img').waitFor(); await composer.press('Enter');
  await page.locator('.entry-body img').waitFor();
  await page.locator('.entry-body img').click(); await page.getByRole('dialog').waitFor();
  assert.ok(await page.locator('.image-preview').isVisible()); await page.keyboard.press('Escape');
  console.log('PASS 本地图片持久化、图片预览');

  await page.keyboard.press('Control+g');
  await page.getByRole('textbox', { name:'分组名称' }).fill('灵感收集');
  await page.getByRole('button', { name:'创建分组', exact:true }).click();
  await page.locator('.composer-group strong').getByText('灵感收集').waitFor();
  assert.ok(await page.locator('.empty-group-button').isVisible());
  await composer.fill('分组里的第一个想法'); await composer.press('Enter');
  await page.locator('.named-group').getByText('分组里的第一个想法', {exact:true}).waitFor();
  console.log('PASS Ctrl+G 命名分组、组内输入');

  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', {name:'搜索笔记',exact:true}).fill('第一个想法');
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===1);
  assert.equal(await page.locator('mark').count(),1);
  await page.getByRole('button',{name:'清空搜索',exact:true}).click();
  await page.getByRole('button',{name:'图片',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===1);
  assert.equal(await page.locator('.entry-body img').count(),1);
  await page.getByRole('button',{name:'链接',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===1);
  assert.equal(await page.locator('.entry-body a').count(),1);
  await page.getByRole('button',{name:'全部',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===5);
  console.log('PASS 全文搜索、关键词高亮、图片和链接筛选');

  const first = page.locator('.entry').first(); await first.hover();
  await first.getByRole('button',{name:'编辑记录',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.closest('.edit-dialog-editor'));
  await page.locator('.edit-dialog-editor [contenteditable="true"]').fill('第一条想法：已编辑，时间保留。');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.getByText('第一条想法：已编辑，时间保留。',{exact:true}).waitFor();
  await first.hover(); await first.getByRole('button',{name:'删除记录',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===4);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===5);
  await page.getByRole('button',{name:'连续笔记',exact:true}).click(); assert.ok(await page.locator('.plain-view').isVisible());
  await page.getByRole('button',{name:'时间分组',exact:true}).click();
  console.log('PASS 编辑、删除撤销、时间/连续视图');

  await page.getByRole('button',{name:'连接 Agent',exact:true}).click();
  const config=JSON.parse(await page.locator('.config-code').textContent());
  assert.equal(config.mcpServers.suiji.env.SUIJI_DATA_DIR,dataDir);
  await page.keyboard.press('Escape');
  await composer.fill('还没提交的草稿，关闭后继续。');
  await closeNormally(page);
  const disk = await new FileStore(dataDir).read();
  const note=disk.notes.find(n=>n.title==='桌面验证笔记');
  assert.equal(note.entries.length,5); assert.ok(note.draft.html.includes('还没提交的草稿'));
  page=await launch();
  await page.locator('.composer [contenteditable="true"]').getByText('还没提交的草稿，关闭后继续。',{exact:true}).waitFor();
  assert.equal(await page.locator('.entry-body img').count(),1);
  assert.equal(await page.locator('.entry').count(),5);
  console.log('PASS 真实关闭并重新启动，正文、图片、命名分组、草稿完整恢复');

  await page.screenshot({path:'test-results/desktop-verified.png'});
  await page.setViewportSize({width:800,height:650});
  await page.screenshot({path:'test-results/compact-verified.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  await page.keyboard.press('Control+n');
  await page.waitForFunction(()=>document.querySelector('.note-title')?.value==='未命名笔记'&&document.activeElement===document.querySelector('.note-title'));
  await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('快速操作验证');
  let rapidComposer=page.locator('.composer [contenteditable="true"]');
  await rapidComposer.fill('快速切换时的草稿');
  await page.locator('.note-item').filter({has:page.locator('.note-item-title').getByText('日常随记',{exact:true})}).click();
  await page.locator('.note-item').filter({has:page.locator('.note-item-title').getByText('快速操作验证',{exact:true})}).click();
  await page.locator('.composer').getByText('快速切换时的草稿',{exact:true}).waitFor();
  rapidComposer=page.locator('.composer [contenteditable="true"]');
  await rapidComposer.evaluate(el=>{for(let i=0;i<2;i++)el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));});
  await page.waitForFunction(()=>document.querySelectorAll('.entry').length===1);
  await untilSaved(page);
  assert.equal(await page.locator('.entry').count(),1);
  console.log('PASS 切换笔记后保留草稿，连续回车不会重复记录');
  await closeNormally(page);
  console.log('PASS 紧凑窗口无水平溢出，无界面运行错误');
  console.log(`Screenshots: ${path.resolve('test-results')}`);
} catch(error) {
  if(app){try{const p=await app.firstWindow();await p.screenshot({path:'test-results/failure.png'});}catch{}}
  console.error(error);process.exitCode=1;
} finally { if(app)try{await app.close();}catch{} }
