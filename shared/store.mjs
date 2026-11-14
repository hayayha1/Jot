import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { applyCommand, initialState } from './model.mjs';

export function defaultDataDir() {
  return process.env.SUIJI_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Suiji');
}

export class FileStore {
  constructor(dir = defaultDataDir()) {
    this.dir = dir;
    this.file = path.join(dir, 'notes.json');
    this.lockPath = path.join(dir, '.write-lock');
    this.queue = Promise.resolve();
  }
  async withLock(fn) {
    await fs.mkdir(this.dir, { recursive: true });
    const deadline = Date.now() + 15000;
    while (true) {
      try { await fs.mkdir(this.lockPath); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // A dead writer's lock can be recovered, without interrupting a live writer.
        try {
          const owner = JSON.parse(await fs.readFile(path.join(this.lockPath, 'owner.json'), 'utf8'));
          try { process.kill(owner.pid, 0); }
          catch (e) { if (e.code === 'ESRCH') await fs.rm(this.lockPath, { recursive: true, force: true }); }
        } catch {
          const stat = await fs.stat(this.lockPath).catch(() => null);
          if (stat && Date.now() - stat.mtimeMs > 30000) await fs.rm(this.lockPath, { recursive: true, force: true });
        }
        if (Date.now() > deadline) throw new Error('笔记正由另一个进程保存，请稍后重试');
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    try {
      await fs.writeFile(path.join(this.lockPath, 'owner.json'), JSON.stringify({ pid: process.pid }));
      return await fn();
    } finally { await fs.rm(this.lockPath, { recursive: true, force: true }); }
  }
  async readRaw() {
    const state = JSON.parse(await fs.readFile(this.file, 'utf8'));
    if (state.schemaVersion !== 1 || !Array.isArray(state.notes) || !Number.isInteger(state.revision)) throw new Error('笔记文件格式不正确，请从备份恢复');
    return state;
  }
  async write(state, backup = true) {
    const temp = path.join(this.dir, `notes.${process.pid}.${crypto.randomUUID()}.tmp`);
    try {
      const file = await fs.open(temp, 'wx');
      try { await file.writeFile(JSON.stringify(state)); await file.sync(); }
      finally { await file.close(); }
      if (backup) {
        const backupTemp = `${temp}.bak`;
        try { await fs.copyFile(this.file, backupTemp); await fs.rename(backupTemp, `${this.file}.bak`); }
        catch (error) { await fs.rm(backupTemp, { force: true }); if (error.code !== 'ENOENT') throw error; }
      }
      await fs.rename(temp, this.file);
    } finally { await fs.rm(temp, { force: true }); }
  }
  async read() {
    await this.queue;
    try { return await this.readRaw(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`无法读取笔记，原文件未改动。${error.message}`);
      return this.withLock(async () => {
        try { return await this.readRaw(); }
        catch (e) {
          if (e.code !== 'ENOENT') throw e;
          const state = initialState();
          await this.write(state, false);
          return state;
        }
      });
    }
  }
  mutate(command) {
    const work = this.queue.then(() => this.withLock(async () => {
      let state;
      try { state = await this.readRaw(); }
      catch (e) { if (e.code !== 'ENOENT') throw e; state = initialState(); }
      const result = applyCommand(state, command);
      await this.write(state);
      return { state, result };
    }));
    this.queue = work.catch(() => {});
    return work;
  }
}
