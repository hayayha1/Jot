import { createServer } from 'vite';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

await fs.mkdir('.test-data',{recursive:true});
const dir=await fs.mkdtemp(path.resolve('.test-data/dev-start-'));
const server=await createServer({server:{host:'127.0.0.1',port:5175,strictPort:false}});
let app;const errors=[];
try{
  await server.listen();const port=server.httpServer.address().port;
  const env={...process.env,SUIJI_DATA_DIR:dir,SUIJI_DEV_URL:`http://127.0.0.1:${port}`};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:['.',`--user-data-dir=${path.join(dir,'profile')}`],env,cwd:process.cwd()});
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.note-canvas').waitFor({timeout:20000});
  assert.ok(await page.evaluate(async()=>Array.isArray((await window.suiji.read()).notes)));
  assert.deepEqual(errors,[]);
  const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;
  console.log('PASS 开发服务与桌面窗口启动，界面加载和本地笔记接口正常');
}catch(error){console.error(error);if(errors.length)console.error('Page errors:',errors);process.exitCode=1;}
finally{if(app)try{await app.close();}catch{}await server.close();}
