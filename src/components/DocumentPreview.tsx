import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PreparedDocument } from '../types';
import './preview.css';

export function DocumentPreview({ document: file, onClose }: { document: PreparedDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    let url = '';
    setError('');
    setBusy(true);
    setPage(1);
    setPdf(undefined);
    if (file.mimeType !== 'application/pdf') {
      url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }));
      setImageUrl(url);
      setBusy(false);
    } else {
      void (async () => {
        try {
          const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
          if (cancelled) return;
          GlobalWorkerOptions.workerSrc = workerUrl;
          const task = getDocument({ data: file.bytes.slice(), useSystemFonts: true, useWasm: false, stopAtErrors: true });
          destroy = () => task.destroy();
          const loaded = await task.promise;
          if (!cancelled) setPdf(loaded);
        } catch {
          if (!cancelled) {
            setError('Pratinjau tidak dapat dibuka. Jangan gunakan hasil sebelum Anda memeriksanya di pembaca dokumen sendiri.');
            setBusy(false);
          }
        }
      })();
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); void destroy?.(); };
  }, [file]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.min(1400 / natural.width, 1800 / natural.height, 2) });
        const element = canvas.current;
        element.width = viewport.width;
        element.height = viewport.height;
        render = pdfPage.render({ canvas: element, viewport });
        await render.promise;
        if (!cancelled) setBusy(false);
      } catch {
        if (!cancelled) {
          setError('Halaman ini gagal ditampilkan. Periksa berkas di pembaca PDF sebelum digunakan.');
          setBusy(false);
        }
      }
    })();
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, page]);

  return <dialog ref={dialog} className="document-preview" aria-labelledby="preview-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="preview-header">
      <div><span className="preview-eyebrow">PERIKSA HASILNYA</span><h2 id="preview-title">{file.filename}</h2></div>
      <button type="button" onClick={onClose} autoFocus>Tutup <span aria-hidden="true">×</span></button>
    </header>
    <p className="preview-hint">Pastikan isi, urutan, dan tulisan terbaca. Pemeriksaan teknis tidak memeriksa kebenaran isi.</p>
    <div className="preview-sheet" aria-busy={busy}>
      {busy && <p role="status">Menyiapkan pratinjau…</p>}
      {error && <p role="alert">{error}</p>}
      {file.mimeType === 'application/pdf'
        ? <canvas ref={canvas} role="img" aria-label={`Pratinjau halaman ${page} dari ${file.filename}`} hidden={busy || !!error} />
        : imageUrl && <img src={imageUrl} alt={`Pratinjau ${file.filename}`} onError={() => setError('Gambar tidak dapat ditampilkan. Periksa kembali berkas sumber.')} hidden={!!error} />}
    </div>
    {pdf && <nav className="preview-pages" aria-label="Halaman pratinjau">
      <button type="button" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>← Sebelumnya</button>
      <span aria-live="polite">{page} / {pdf.numPages}</span>
      <button type="button" disabled={page >= pdf.numPages || busy} onClick={() => setPage(page + 1)}>Berikutnya →</button>
    </nav>}
  </dialog>;
}
