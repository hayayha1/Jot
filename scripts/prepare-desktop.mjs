import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.resolve(root, '.desktop');
if (path.dirname(target) !== root || path.basename(target) !== '.desktop') throw new Error('打包目录不正确');
const existing = await fs.lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
if (existing?.isSymbolicLink()) throw new Error('打包目录不能是符号链接');
if (existing && path.dirname(await fs.realpath(target)) !== await fs.realpath(root)) throw new Error('打包目录不在项目内');
await fs.rm(target, { recursive:true, force:true });
await fs.mkdir(target, { recursive: true });
for (const folder of ['dist', 'electron', 'shared', 'assets']) await fs.cp(path.join(root, folder), path.join(target, folder), { recursive: true, force: true });
await fs.mkdir(path.join(target, 'mcp'), { recursive: true });
await build({ entryPoints: ['mcp/server.mjs'], outfile: path.join(target, 'mcp/server.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', minify: true, legalComments: 'eof' });
const { name, version, description, author, license } = JSON.parse(await fs.readFile('package.json', 'utf8'));
await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version, description, author, license, main: 'electron/main.cjs', type: 'module' }, null, 2));
console.log('桌面资源已准备就绪，MCP 已打包，无需另装 Node.js。');
