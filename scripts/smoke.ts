import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { createDemoFiles, preparePackage, createArchive } from '../src/lib/documents.ts';

const files = await createDemoFiles();
const result = await preparePackage(files.map((file, index) => ({
  requirement: { id: `demo-${index}`, title: index ? 'Surat lamaran' : 'CV', required: true, format: 'pdf' as const, maxSizeMB: 2, maxPages: 2, outputName: index ? 'Surat-lamaran' : 'CV' },
  files: [file],
})));
assert.equal(result.ready, true);
const archive = await createArchive(result);
const entries = unzipSync(archive);
assert.deepEqual(Object.keys(entries).sort(), ['CV.pdf', 'Surat-lamaran.pdf', 'checklist.txt', 'manifest.json']);
const manifest = JSON.parse(strFromU8(entries['manifest.json']));
assert.equal(manifest.documents.length, 2);
await mkdir('output/pdf', { recursive: true });
await mkdir('tmp/pdfs', { recursive: true });
for (const file of files) await writeFile(`tmp/pdfs/${file.name}`, new Uint8Array(await file.arrayBuffer()));
for (const document of result.documents) {
  assert.deepEqual(entries[document.filename], document.bytes);
  assert.equal((await PDFDocument.load(entries[document.filename])).getPageCount(), 1);
  await writeFile(`output/pdf/${document.filename}`, document.bytes);
}
await writeFile('output/berkassiap-contoh.zip', archive);
console.log('PASS: contoh -> pemeriksaan -> ZIP -> buka ulang -> 2 PDF utuh, manifest dan checklist.');
