import { describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import type { DocumentInput, Requirement } from '../types';
import { createArchive, createDemoFiles, formatBytes, LIMITS, preparePackage } from './documents';

const requirement = (changes: Partial<Requirement> = {}): Requirement => ({ id: 'cv', title: 'CV', required: true, format: 'pdf', maxSizeMB: 2, outputName: 'CV-Nama', ...changes });
const input = (files: File[], changes: Partial<Requirement> = {}): DocumentInput => ({ requirement: requirement(changes), files });
const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZ8AAAAASUVORK5CYII='), char => char.charCodeAt(0));
const png = () => new File([pngBytes], 'contoh.png', { type: 'image/png' });
const jpegBytes = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAoAFADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAcJ/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AnRDGqYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q=='), char => char.charCodeAt(0));

function exifImage(orientation: number, kind: 'jpg' | 'png'): Uint8Array {
  const tiff = Uint8Array.from([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]);
  if (kind === 'jpg') {
    const metadata = Uint8Array.from([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, ...tiff]);
    const bytes = new Uint8Array(jpegBytes.length + metadata.length);
    bytes.set(jpegBytes.subarray(0, 2)); bytes.set(metadata, 2); bytes.set(jpegBytes.subarray(2), metadata.length + 2);
    return bytes;
  }
  const chunk = new Uint8Array(tiff.length + 12);
  new DataView(chunk.buffer).setUint32(0, tiff.length);
  chunk.set(new TextEncoder().encode('eXIf'), 4); chunk.set(tiff, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  new DataView(chunk.buffer).setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  const bytes = new Uint8Array(pngBytes.length + chunk.length);
  bytes.set(pngBytes.subarray(0, 33)); bytes.set(chunk, 33); bytes.set(pngBytes.subarray(33), 33 + chunk.length);
  return bytes;
}

function imageMatrix(pdf: PDFDocument): number[] {
  const contents = pdf.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray);
  const stream = pdf.context.lookup(contents.get(0));
  if (!(stream instanceof PDFRawStream)) throw new Error('Expected exported page content stream');
  const commands = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  let current = [1, 0, 0, 1, 0, 0];
  for (const line of commands.split('\n').filter(line => line.endsWith(' cm'))) {
    const [a, b, c, d, e, f] = line.split(' ').slice(0, 6).map(Number);
    const [p, q, r, s, t, u] = current;
    current = [p * a + r * b, q * a + s * b, p * c + r * d, q * c + s * d, p * e + r * f + t, q * e + s * f + u];
  }
  return current;
}

async function pdfFile(widths = [200], name = 'contoh.pdf'): Promise<File> {
  const pdf = await PDFDocument.create();
  widths.forEach(width => pdf.addPage([width, 300]));
  return new File([new Uint8Array(await pdf.save())], name, { type: 'application/pdf' });
}

describe('pemeriksaan kebutuhan', () => {
  it('menolak paket kosong dan kebutuhan wajib yang hilang', async () => {
    expect((await preparePackage([])).ready).toBe(false);
    const result = await preparePackage([input([])]);
    expect(result.issues[0].code).toBe('missing');
    expect(result.ready).toBe(false);
  });

  it('mengizinkan kebutuhan opsional kosong, tetapi tidak paket tanpa hasil', async () => {
    expect((await preparePackage([input([], { required: false })])).ready).toBe(false);
    const result = await preparePackage([input([await pdfFile()]), input([], { id: 'lain', required: false })]);
    expect(result.ready).toBe(true);
  });

  it.each([
    { outputName: '' }, { outputName: ' '.repeat(3) }, { maxSizeMB: 0 }, { maxSizeMB: NaN }, { maxSizeMB: 21 },
    { maxPages: 0 }, { maxPages: 101 }, { maxPages: 1.5 }, { title: '' }, { id: '' },
  ])('menolak konfigurasi tidak valid %j', async changes => {
    const result = await preparePackage([input([await pdfFile()], changes)]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].code).toBe('config');
  });

  it('menolak ID duplikat', async () => {
    const file = await pdfFile();
    const result = await preparePackage([input([file]), input([file], { outputName: 'lain' })]);
    expect(result.issues.some(issue => issue.code === 'duplicate-id')).toBe(true);
    expect(result.ready).toBe(false);
  });

  it('menolak batas berkas, ukuran per berkas, dan ukuran total sebelum membaca', async () => {
    const file = await pdfFile();
    expect((await preparePackage([input(Array.from({ length: LIMITS.maxFiles + 1 }, () => file))])).issues[0].code).toBe('file-count');
    const fake = { name: 'besar.pdf', type: 'application/pdf', size: LIMITS.maxFileBytes + 1, arrayBuffer: () => { throw new Error('must not read'); } } as unknown as File;
    expect((await preparePackage([input([fake])])).issues[0].message).toContain('20 MB');
    expect((await preparePackage([input([fake, fake, fake])])).issues[0].code).toBe('total-size');
  });
});

describe('validasi isi berkas', () => {
  it('menolak teks yang hanya dinamai PDF, ekstensi palsu, dan MIME yang salah', async () => {
    const wrong = new File(['bukan PDF'], 'palsu.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([wrong])])).ready).toBe(false);
    const renamed = new File([pngBytes], 'palsu.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([renamed])])).issues[0].message).toContain('ekstensi');
    const mime = new File([pngBytes], 'contoh.png', { type: 'text/html' });
    expect((await preparePackage([input([mime])])).issues[0].message).toContain('jenis berkas');
  });

  it('menolak PDF rusak atau terpotong', async () => {
    const damaged = new File(['%PDF-1.7\nini bukan PDF\n%%EOF'], 'rusak.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([damaged])])).ready).toBe(false);
    const valid = new Uint8Array(await (await pdfFile()).arrayBuffer());
    const truncated = new File([valid.slice(0, valid.length - 15)], 'terpotong.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([truncated])])).issues[0].message).toContain('terpotong');
  });

  it('menolak PDF bertanda enkripsi tanpa mengabaikan proteksinya', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: 'Standard', V: 1, R: 2 }));
    const file = new File([new Uint8Array(await pdf.save())], 'terkunci.pdf', { type: 'application/pdf' });
    const result = await preparePackage([input([file])]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].message).toContain('terenkripsi');
  });

  it.each(['FT', 'Type', 'ByteRange'])('menolak objek tanda tangan melalui parser: %s', async key => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const dictionary = pdf.context.obj({});
    dictionary.set(PDFName.of(key), key === 'ByteRange' ? pdf.context.obj([0, 10, 20, 30]) : PDFName.of('Sig'));
    pdf.catalog.set(PDFName.of('TestSignature'), pdf.context.register(dictionary));
    const file = new File([new Uint8Array(await pdf.save())], 'bertanda-tangan.pdf', { type: 'application/pdf' });
    const result = await preparePackage([input([file])]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].message).toContain('tanda tangan');
  });

  it('mengenali tipe tanda tangan berupa referensi tidak langsung', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.catalog.set(PDFName.of('TestSignature'), pdf.context.obj({ FT: pdf.context.register(PDFName.of('Sig')) }));
    const file = new File([new Uint8Array(await pdf.save())], 'bertanda-tangan.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([file])])).issues[0].message).toContain('tanda tangan');
  });

  it('menolak gambar terpotong dan gambar lebih dari 40 megapiksel sebelum decoding', async () => {
    const truncated = new File([pngBytes.slice(0, -10)], 'rusak.png', { type: 'image/png' });
    expect((await preparePackage([input([truncated])])).ready).toBe(false);
    const huge = new Uint8Array(pngBytes);
    new DataView(huge.buffer).setUint32(16, 40_000_001);
    const result = await preparePackage([input([new File([huge], 'besar.png', { type: 'image/png' })])]);
    expect(result.issues[0].message).toContain('40 megapiksel');
  });

  it.each(['jpg', 'png'] as const)('mempertahankan orientasi EXIF 1–8 pada konversi %s tanpa mengubah sumber', async kind => {
    const w = kind === 'jpg' ? 80 : 1;
    const h = kind === 'jpg' ? 40 : 1;
    const expected = [
      [w, 0, 0, h, 0, 0], [-w, 0, 0, h, w, 0], [-w, 0, 0, -h, w, h], [w, 0, 0, -h, 0, h],
      [0, -w, -h, 0, h, w], [0, -w, h, 0, 0, w], [0, w, h, 0, 0, 0], [0, w, -h, 0, h, 0],
    ];
    for (let orientation = 1; orientation <= 8; orientation++) {
      const bytes = exifImage(orientation, kind);
      const file = new File([new Uint8Array(bytes)], `orientation-${orientation}.${kind}`, { type: kind === 'jpg' ? 'image/jpeg' : 'image/png' });
      const result = await preparePackage([input([file])]);
      expect(result.ready).toBe(true);
      const pdf = await PDFDocument.load(result.documents[0].bytes);
      expect(pdf.getPage(0).getSize()).toEqual(orientation >= 5 ? { width: h, height: w } : { width: w, height: h });
      imageMatrix(pdf).forEach((value, index) => expect(value).toBeCloseTo(expected[orientation - 1][index], 8));
      if (kind === 'jpg') {
        const images = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
        const embedded = pdf.context.lookup(images.values()[0]);
        expect(embedded).toBeInstanceOf(PDFRawStream);
        expect((embedded as PDFRawStream).getContents()).toEqual(bytes);
      }
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
      const original = await preparePackage([input([file], { format: 'original' })]);
      expect(original.ready).toBe(true);
      expect(original.documents[0].bytes).toEqual(bytes);
    }
  });

  it.each([0, 9])('menolak metadata EXIF di luar rentang 1–8: %s', async orientation => {
    const file = new File([new Uint8Array(exifImage(orientation, 'jpg'))], 'rusak.jpg', { type: 'image/jpeg' });
    const result = await preparePackage([input([file])]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].message).toContain('Metadata orientasi');
  });

  it('kesalahan satu kebutuhan tidak menggagalkan pemeriksaan kebutuhan lain', async () => {
    const bad = new File(['bad'], 'rusak.pdf');
    const result = await preparePackage([input([bad]), input([await pdfFile()], { id: 'surat', title: 'Surat', outputName: 'Surat' })]);
    expect(result.documents).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.ready).toBe(false);
  });
});

describe('hasil yang benar-benar diekspor', () => {
  it('mempertahankan byte PDF tunggal dan gambar pada format asli', async () => {
    const file = await pdfFile();
    const pdf = await preparePackage([input([file])]);
    expect(pdf.ready).toBe(true);
    expect(pdf.documents[0].bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    const image = await preparePackage([input([png()], { format: 'original', outputName: 'Foto.jpg' })]);
    expect(image.ready).toBe(true);
    expect(image.documents[0].filename).toBe('Foto.png');
    expect(image.documents[0].bytes).toEqual(pngBytes);
  });

  it('menggabungkan PDF dan gambar sesuai urutan pilihan', async () => {
    const result = await preparePackage([input([await pdfFile([200]), png(), await pdfFile([400, 500])])]);
    expect(result.ready).toBe(true);
    const pdf = await PDFDocument.load(result.documents[0].bytes);
    expect(pdf.getPages().map(page => page.getWidth())).toEqual([200, 1, 400, 500]);
    expect(result.documents[0].pageCount).toBe(4);
  });

  it('menilai ukuran byte hasil, bukan ukuran sumber gambar', async () => {
    const result = await preparePackage([input([png()], { maxSizeMB: 0.0005 })]);
    expect(pngBytes.length).toBeLessThan(500);
    expect(result.documents[0].bytes.length).toBeGreaterThan(500);
    expect(result.documents[0].issues[0].code).toBe('size');
    expect(result.ready).toBe(false);
    await expect(createArchive(result)).rejects.toThrow('Selesaikan');
  });

  it('menerapkan batas total pada byte hasil yang membesar setelah konversi', async () => {
    const original = LIMITS.maxTotalBytes;
    Object.defineProperty(LIMITS, 'maxTotalBytes', { value: 1_000 });
    try {
      const result = await preparePackage([input([png()]), input([png()], { id: 'foto', outputName: 'foto' })]);
      expect(result.issues.some(issue => issue.code === 'total-output-size')).toBe(true);
      expect(result.ready).toBe(false);
      await expect(createArchive({ ...result, ready: true, issues: [] })).rejects.toThrow('50 MB');
    } finally { Object.defineProperty(LIMITS, 'maxTotalBytes', { value: original }); }
  });

  it('menilai jumlah halaman hasil dan batas keamanan 100 halaman', async () => {
    const result = await preparePackage([input([await pdfFile([200]), await pdfFile([300])], { maxPages: 1 })]);
    expect(result.documents[0].issues[0].code).toBe('pages');
    expect(result.ready).toBe(false);
    const many = await preparePackage([input([await pdfFile(Array(101).fill(200))])]);
    expect(many.issues[0].message).toContain('1–100');
  });

  it('menolak penggabungan format asli dan formulir interaktif', async () => {
    expect((await preparePackage([input([png(), png()], { format: 'original' })])).issues[0].message).toContain('satu berkas');
    const form = await PDFDocument.create();
    const page = form.addPage();
    form.getForm().createTextField('Nama').addToPage(page);
    const file = new File([new Uint8Array(await form.save())], 'form.pdf', { type: 'application/pdf' });
    expect((await preparePackage([input([file, png()])])).issues[0].message).toContain('formulir');
    expect((await preparePackage([input([file])])).ready).toBe(true);
  });

  it('menolak XFA sebelum getForm dapat menghapusnya; pass-through tetap utuh', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const xfa = pdf.context.stream(new TextEncoder().encode('<xdp:xdp><field name="nama">Contoh</field></xdp:xdp>'));
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ XFA: pdf.context.register(xfa), Fields: [] }));
    const bytes = new Uint8Array(await pdf.save());
    const file = new File([bytes], 'form-xfa.pdf', { type: 'application/pdf' });
    const result = await preparePackage([input([file, await pdfFile()])]);
    expect(result.ready).toBe(false);
    expect(result.issues[0].message).toContain('XFA');
    const original = await preparePackage([input([file])]);
    expect(original.ready).toBe(true);
    expect(original.documents[0].bytes).toEqual(bytes);
  });

  it('menghapus aksi halaman dan anotasi dari PDF gabungan', async () => {
    const source = await PDFDocument.create();
    const page = source.addPage();
    page.node.set(PDFName.of('AA'), source.context.obj({ O: { S: 'JavaScript', JS: 'alert(1)' } }));
    page.node.set(PDFName.of('Annots'), source.context.obj([source.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], A: { S: 'JavaScript', JS: 'alert(2)' } })]));
    const file = new File([new Uint8Array(await source.save())], 'aksi.pdf', { type: 'application/pdf' });
    const result = await preparePackage([input([file, png()])]);
    expect(result.ready).toBe(true);
    const merged = await PDFDocument.load(result.documents[0].bytes);
    expect(merged.getPages()[0].node.has(PDFName.of('AA'))).toBe(false);
  });

  it('mencegah benturan nama tanpa membedakan kapital dan membersihkan path', async () => {
    const file = await pdfFile();
    const duplicate = await preparePackage([input([file], { outputName: 'CV' }), input([file], { id: 'lain', outputName: 'cv' })]);
    expect(duplicate.ready).toBe(false);
    expect(duplicate.documents[1].issues[0].code).toBe('duplicate-name');
    const safe = await preparePackage([input([file], { outputName: '../../Folder\\CV.pdf' })]);
    expect(safe.ready).toBe(true);
    expect(safe.documents[0].filename).not.toMatch(/[\\/]/);
    expect(safe.documents[0].filename.startsWith('.')).toBe(false);
    const long = await preparePackage([input([file], { outputName: '😀'.repeat(70) })]);
    expect(long.ready).toBe(false);
    expect(long.issues[0].message).toContain('terlalu panjang');
  });

  it('ZIP dapat dibuka, byte cocok, dan manifest/checklist menjelaskan batas pemeriksaan', async () => {
    const result = await preparePackage([input([await pdfFile()])]);
    const zip = unzipSync(await createArchive(result));
    expect(Object.keys(zip).sort()).toEqual(['CV-Nama.pdf', 'checklist.txt', 'manifest.json']);
    expect(zip['CV-Nama.pdf']).toEqual(result.documents[0].bytes);
    expect(JSON.parse(strFromU8(zip['manifest.json'])).documents[0].sizeBytes).toBe(result.documents[0].bytes.length);
    expect(strFromU8(zip['checklist.txt'])).toContain('bukan jaminan diterima');
    result.documents[0].filename = '../escape.pdf';
    await expect(createArchive(result)).rejects.toThrow('tidak aman');
  });

  it('contoh berisi dua PDF simulasi yang dapat diproses', async () => {
    const files = await createDemoFiles();
    expect(files.map(file => file.name)).toEqual(['contoh-cv.pdf', 'contoh-surat-lamaran.pdf']);
    const result = await preparePackage(files.map((file, index) => input([file], { id: String(index), outputName: file.name })));
    expect(result.ready).toBe(true);
    expect(result.documents.every(doc => doc.pageCount === 1)).toBe(true);
  });

  it('memakai ukuran desimal yang konsisten dengan batas MB', () => {
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(1_500)).toBe('1,5 kB');
  });
});
