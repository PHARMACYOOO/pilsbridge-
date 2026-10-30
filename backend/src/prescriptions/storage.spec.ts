import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sniff, StorageService } from './storage.service.js';

describe('sniff', () => {
  it('identifies files by content', () => {
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniff(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(sniff(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniff(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // Windows executable
  });
});

describe('StorageService folders', () => {
  it('only reads keys from the folder asked for, and nothing outside the upload root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pilbridge-storage-'));
    const storage = new StorageService({ get: () => root } as never);
    const pdf = Buffer.from('%PDF-1.7 test');

    const key = await storage.save(pdf, 'application/pdf', 'compliance');
    expect(key).toMatch(/^compliance\//);
    expect(await storage.read(key, 'compliance')).toEqual(pdf);
    await expect(storage.read(key)).rejects.toThrow('Invalid storage key'); // a compliance key through the prescriptions path
    await expect(storage.read('compliance/../../etc/passwd', 'compliance')).rejects.toThrow('Invalid storage key');
  });
});
