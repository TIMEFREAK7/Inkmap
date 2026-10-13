import { describe, expect, it } from 'vitest';
import { writeBackup, BACKUP, PREV } from '../src/backup.js';

function memoryFs() {
  const files = new Map();
  return {
    files,
    write: async (p, d) => { files.set(p, d); },
    exists: async p => files.has(p),
    remove: async p => { files.delete(p); },
    rename: async (a, b) => { files.set(b, files.get(a)); files.delete(a); },
  };
}

describe('automatic backup file rotation', () => {
  it('keeps the newest as the backup and the one before as .prev', async () => {
    const fs = memoryFs();
    await writeBackup(fs, 'v1');
    await writeBackup(fs, 'v2');
    await writeBackup(fs, 'v3');
    expect(fs.files.get(BACKUP)).toBe('v3');
    expect(fs.files.get(PREV)).toBe('v2');
  });

  it('keeps the previous copy when a write is interrupted halfway', async () => {
    const fs = memoryFs();
    await writeBackup(fs, 'good');
    fs.write = async () => { throw new Error('power loss'); };
    await expect(writeBackup(fs, 'new')).rejects.toThrow('power loss');
    expect(fs.files.get(BACKUP)).toBe('good');
  });

  it('keeps a good copy when interrupted between the two moves', async () => {
    const fs = memoryFs();
    await writeBackup(fs, 'v1');
    await writeBackup(fs, 'v2');
    const rename = fs.rename;
    fs.rename = async (a, b) => { if (b === BACKUP) throw new Error('killed'); return rename(a, b); };
    await expect(writeBackup(fs, 'v3')).rejects.toThrow('killed');
    expect(fs.files.get(PREV)).toBe('v2'); // restore falls back to .prev
  });
});
