import { _electron as electron } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
const executablePath=path.resolve('release/win-unpacked/随记.exe');
const archive=path.resolve('release/win-unpacked/resources/app.asar');
const files=asar.listPackage(archive);
assert.equal(files.filter(f=>f.includes('node_modules')).length,0,'发行包不应含已打包的重复依赖');
await fs.mkdir('.test-data',{recursive:true});await fs.mkdir('test-results',{recursive:true});
const dataDir=await fs.mkdtemp(path.resolve('.test-data/release-'));
const env={...process.env,SUIJI_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.SUIJI_DEV_URL;
let app;let client;const errors=[];
async function launch(){
  app=await electron.launch({executablePath,args:[`--user-data-dir=${path.join(dataDir,'profile')}`],env,cwd:process.cwd()});
  await app.evaluate(({shell})=>{globalThis.__releaseOpened=[];shell.openExternal=async url=>{globalThis.__releaseOpened.push(url);};});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('.note-title').waitFor();return page;
}
async function close(){const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;}
try{
  let page=await launch();
  await page.waitForFunction(()=>document.activeElement?.classList.contains('note-canvas'));
  const info=await page.evaluate(()=>window.suiji.info());
  assert.ok(info.desktop);assert.equal(info.version,version);assert.equal(info.mcpConfig.mcpServers.suiji.command,executablePath);assert.ok(info.mcpConfig.mcpServers.suiji.args[0].endsWith('server.cjs'));
  await page.screenshot({path:'test-results/release-preview.png'});
  const config=info.mcpConfig.mcpServers.suiji;
  client=new Client({name:'release-verifier',version:'1.0'});
  await client.connect(new StdioClientTransport({command:config.command,args:config.args,env:{...process.env,...config.env},stderr:'pipe'}));
  const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
  const notes=await call('list_notes',{});const note=notes.find(n=>n.title==='开始使用随记');
  await call('append_entry',{noteId:note.id,text:'打包后的 Agent 已成功写入。',expectedRevision:note.revision});
  await page.locator('.note-canvas').getByText('打包后的 Agent 已成功写入。',{exact:true}).waitFor();
  const beforeLink=await call('get_note',{noteId:note.id});
  await call('append_entry',{noteId:note.id,text:'https://example.com/default-browser',expectedRevision:beforeLink.revision});
  await page.locator('.note-canvas a[href="https://example.com/default-browser"]').click();
  await page.waitForTimeout(50);assert.deepEqual(await app.evaluate(()=>globalThis.__releaseOpened),['https://example.com/default-browser']);
  const updatedNote=await call('get_note',{noteId:note.id});
  await call('rename_note',{noteId:note.id,title:'开始使用随记 · MCP已连接',expectedRevision:updatedNote.revision});
  await page.waitForFunction(()=>document.querySelector('.note-title')?.value==='开始使用随记 · MCP已连接');
  await page.locator('.note-canvas').click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.insertText('发行版关闭前直接写的最后一行');
  await close();
  page=await launch();await page.locator('.note-canvas').getByText('发行版关闭前直接写的最后一行',{exact:true}).waitFor();
  assert.equal(await page.locator('.note-title').inputValue(),'开始使用随记 · MCP已连接');
  await page.locator('.note-canvas').getByText('打包后的 Agent 已成功写入。',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await close();await client.close();client=null;
  const archiveBytes=(await fs.stat(archive)).size;
  const installer=await fs.stat(`release/Suiji-Setup-${version}.exe`);
  console.log(JSON.stringify({result:'PASS',packagedLaunch:true,defaultBrowserDispatch:true,standaloneMcp:true,liveAgentSync:true,closeAndRestore:true,duplicateDependencies:0,archiveMB:(archiveBytes/1048576).toFixed(2),installerMB:(installer.size/1048576).toFixed(2)},null,2));
}catch(error){console.error(error);process.exitCode=1;}
finally{if(client)try{await client.close();}catch{}if(app)try{await app.close();}catch{}}
