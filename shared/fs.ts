import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureDirFor(filePath: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    await ensureDirFor(filePath);
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export async function writeJson<T>(filePath: string, payload: T): Promise<void> {
  await ensureDirFor(filePath);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
