import { useRef, useState } from "react";
import type {
  DocumentInput,
  PackageResult,
  PreparedDocument,
  Requirement,
} from "./types";
import { downloadBytes, formatBytes } from "./lib/files";
import { DocumentPreview } from "./components/DocumentPreview";
import { ReplaceConfirmation } from "./components/ReplaceConfirmation";

type Preset = "lamaran" | "pendaftaran" | "sendiri";
type Busy = "demo" | "prepare" | "download" | null;

const presets: { id: Preset; title: string; detail: string }[] = [
  { id: "lamaran", title: "Lamaran kerja", detail: "CV + surat lamaran" },
  {
    id: "pendaftaran",
    title: "Pendaftaran",
    detail: "Dua dokumen persyaratan",
  },
  { id: "sendiri", title: "Paket sendiri", detail: "Mulai dari kebutuhanmu" },
];

function makeInputs(preset: Preset): DocumentInput[] {
  const titles =
    preset === "lamaran"
      ? ["CV", "Surat lamaran"]
      : preset === "pendaftaran"
        ? ["Dokumen pertama", "Dokumen kedua"]
        : ["Dokumen saya"];
  return titles.map((title) => ({
    requirement: {
      id: crypto.randomUUID(),
      title,
      required: true,
      format: "pdf",
      maxSizeMB: 2,
      outputName: title.toLowerCase().replaceAll(" ", "-"),
    },
    files: [],
  }));
}

function Icon({
  name,
  size = 20,
}: {
  name:
    | "file"
    | "check"
    | "plus"
    | "download"
    | "arrow"
    | "close"
    | "shield"
    | "up"
    | "down"
    | "eye"
    | "info";
  size?: number;
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    file: (
      <>
        <path d="M14 3H5v18h14V8z" />
        <path d="M14 3v5h5M8 13h8M8 17h5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    up: <path d="m6 15 6-6 6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function App() {
  const [preset, setPreset] = useState<Preset>("lamaran");
  const [inputs, setInputs] = useState<DocumentInput[]>(() =>
    makeInputs("lamaran"),
  );
  const [result, setResult] = useState<PackageResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preview, setPreview] = useState<PreparedDocument | null>(null);
  const [confirmation, setConfirmation] = useState<((answer: boolean) => void) | null>(null);
  const busyRef = useRef(false);
  const runId = useRef(0);
  const summaryRef = useRef<HTMLElement>(null);
  const populated = inputs.filter((input) => input.files.length > 0).length;
  const required = inputs.filter((input) => input.requirement.required);
  const missing = required.filter((input) => !input.files.length).length;
  const hasFiles = populated > 0;

  function invalidate() {
    runId.current += 1;
    setResult(null);
    setError("");
    setPreview(null);
  }

  function changeInputs(
    update: (previous: DocumentInput[]) => DocumentInput[],
  ) {
    if (busyRef.current) return;
    invalidate();
    setInputs(update);
  }

  function changeRequirement(id: string, change: Partial<Requirement>) {
    changeInputs((previous) =>
      previous.map((input) =>
        input.requirement.id === id
          ? { ...input, requirement: { ...input.requirement, ...change } }
          : input,
      ),
    );
  }

  function replaceAllowed() {
    if (!hasFiles) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setConfirmation(() => resolve));
  }

  async function choosePreset(next: Preset) {
    if (busyRef.current || next === preset || !(await replaceAllowed())) return;
    invalidate();
    setPreset(next);
    setInputs(makeInputs(next));
    setDemo(false);
  }

  function addFiles(id: string, files: File[]) {
    if (!files.length || busyRef.current) return;
    setDemo(false);
    changeInputs((previous) =>
      previous.map((input) =>
        input.requirement.id === id
          ? { ...input, files: [...input.files, ...files] }
          : input,
      ),
    );
  }

  function moveFile(id: string, index: number, direction: -1 | 1) {
    changeInputs((previous) =>
      previous.map((input) => {
        if (input.requirement.id !== id) return input;
        const files = [...input.files];
        const destination = index + direction;
        if (destination < 0 || destination >= files.length) return input;
        [files[index], files[destination]] = [files[destination], files[index]];
        return { ...input, files };
      }),
    );
  }

  async function loadDemo() {
    if (busyRef.current || !(await replaceAllowed())) return;
    invalidate();
    const token = runId.current;
    busyRef.current = true;
    setBusy("demo");
    try {
      const { createDemoFiles } = await import("./lib/documents");
      const files = await createDemoFiles();
      if (token !== runId.current) return;
      setInputs(
        makeInputs("lamaran").map((input, index) => ({
          ...input,
          files: files[index] ? [files[index]] : [],
        })),
      );
      setPreset("lamaran");
      setDemo(true);
    } catch {
      setError(
        "Contoh berkas belum berhasil dibuat. Coba lagi atau pilih berkas dari perangkatmu.",
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function checkPackage() {
    if (busyRef.current) return;
    invalidate();
    const token = runId.current;
    busyRef.current = true;
    setBusy("prepare");
    try {
      const { preparePackage } = await import("./lib/documents");
      const prepared = await preparePackage(inputs);
      if (token !== runId.current) return;
      setResult(prepared);
      summaryRef.current?.focus({ preventScroll: true });
      summaryRef.current?.scrollIntoView({
        behavior: "instant",
        block: "nearest",
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Berkas belum berhasil diperiksa. Coba kurangi jumlah atau ukuran berkas lalu periksa lagi.",
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function downloadPackage() {
    if (!result?.ready || busyRef.current) return;
    busyRef.current = true;
    setBusy("download");
    setError("");
    try {
      const { createArchive } = await import("./lib/documents");
      const bytes = await createArchive(result);
      downloadBytes(
        bytes,
        demo ? "berkassiap-contoh.zip" : "berkassiap.zip",
        "application/zip",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Paket belum berhasil dibuat. Coba unduh setiap berkas secara terpisah.",
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function downloadDocument(document: PreparedDocument) {
    try {
      downloadBytes(document.bytes, document.filename, document.mimeType);
    } catch {
      setError(
        "Unduhan belum berhasil dimulai. Periksa izin unduhan browser, lalu coba lagi.",
      );
    }
  }

  async function reset() {
    if (busyRef.current || !(await replaceAllowed())) return;
    invalidate();
    setInputs(makeInputs(preset));
    setDemo(false);
  }

  const checkedDocuments =
    result?.documents.filter((document) => !document.issues.length) ?? [];

  return (
    <>
      <a className="skip-link" href="#workspace">
        Langsung ke berkas
      </a>
      <div className="app-shell">
        <header className="site-header">
          <a
            className="brand"
            href="#"
            aria-label="BerkasSiap, kembali ke atas"
          >
            <span className="brand-symbol">
              <Icon name="file" size={23} />
              <span>
                <Icon name="check" size={12} />
              </span>
            </span>
            <span>BerkasSiap</span>
            <span className="beta">BETA</span>
          </a>
          <button
            className="help-button"
            type="button"
            onClick={() => setHelpOpen(!helpOpen)}
            aria-expanded={helpOpen}
            aria-controls="how-to"
          >
            <Icon name="info" size={18} /> Cara pakai
          </button>
        </header>

        {helpOpen && (
          <section
            className="help-panel"
            id="how-to"
            aria-labelledby="help-title"
          >
            <div>
              <p className="eyebrow">TIGA LANGKAH, TANPA AKUN</p>
              <h2 id="help-title">Siapkan berkas, bukan tebak persyaratan.</h2>
            </div>
            <ol>
              <li>
                <strong>Pilih kebutuhan.</strong> Sesuaikan nama, format, dan
                batas ukuran dengan petunjuk penerima.
              </li>
              <li>
                <strong>Tambahkan berkas.</strong> PDF atau foto digabung sesuai
                urutan dalam satu kebutuhan.
              </li>
              <li>
                <strong>Periksa dan unduh.</strong> Lihat hasilnya dulu. Unggah
                berkas satu per satu ke tempat tujuanmu.
              </li>
            </ol>
            <p>
              PDF berpassword dan bertanda tangan digital belum didukung. Tidak
              ada unggah otomatis ke portal mana pun.
            </p>
          </section>
        )}

        <main>
          <section className="intro" aria-labelledby="page-title">
            <div className="intro-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" /> URUSAN BERKAS, DIBIKIN RINGKAS
              </p>
              <h1 id="page-title">
                Bereskan berkas.
                <br />
                <em>Lanjut urusanmu.</em>
              </h1>
              <p className="intro-description">
                Gabungkan PDF atau foto, cek ukuran dan kelengkapannya.
                <br className="desktop-break" /> Unduh hasil yang rapi, tanpa
                mengunggah dokumenmu.
              </p>
            </div>
            <div className="intro-aside">
              <span className="privacy-symbol">
                <Icon name="shield" size={27} />
              </span>
              <p>
                <strong>Tetap di perangkatmu.</strong>
                <span>
                  Berkas diproses di browser.
                  <br />
                  {" "}Tanpa akun. Tanpa unggah.
                </span>
              </p>
              <button
                type="button"
                className="text-button demo-button"
                onClick={loadDemo}
                disabled={!!busy}
              >
                {busy === "demo"
                  ? "Menyiapkan contoh…"
                  : "Coba dengan berkas contoh"}{" "}
                <Icon name="arrow" size={17} />
              </button>
            </div>
          </section>

          <nav className="workflow" aria-label="Alur menyiapkan berkas">
            <ol>
              <li className="current">
                <span>01</span>Pilih kebutuhan
              </li>
              <li className={hasFiles ? "current" : ""}>
                <span>02</span>Tambahkan berkas
              </li>
              <li className={result?.ready ? "current" : ""}>
                <span>03</span>Periksa & unduh
              </li>
            </ol>
            <span className="workflow-note">Semua di satu tempat.</span>
          </nav>

          <section
            className="workspace"
            id="workspace"
            aria-label="Meja kerja berkas"
          >
            <div className="documents-column">
              <fieldset className="preset-fieldset" disabled={!!busy}>
                <legend>
                  <span className="section-number">01</span> Untuk keperluan
                  apa?
                </legend>
                <div
                  className="preset-options"
                  role="group"
                  aria-label="Contoh kebutuhan"
                >
                  {presets.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`preset-option ${preset === option.id ? "selected" : ""}`}
                      aria-pressed={preset === option.id}
                      onClick={() => choosePreset(option.id)}
                    >
                      <span>{option.title}</span>
                      <small>{option.detail}</small>
                      {preset === option.id && <Icon name="check" size={17} />}
                    </button>
                  ))}
                </div>
                <p className="hint preset-hint">
                  Ini contoh susunan, bukan persyaratan resmi. Sesuaikan dengan
                  petunjuk penerima.
                </p>
              </fieldset>

              <div className="section-heading">
                <h2>
                  <span className="section-number">02</span> Tambahkan berkasmu
                </h2>
                <span>{inputs.length} kebutuhan</span>
              </div>
              {demo && (
                <div className="demo-notice" role="status">
                  <Icon name="info" size={19} />
                  <p>
                    <strong>Kamu sedang mencoba berkas contoh.</strong> Seluruh
                    nama dan isi di dalamnya fiktif. Silakan periksa, lihat,
                    lalu unduh hasilnya.
                  </p>
                </div>
              )}
              <fieldset
                className="documents-fieldset"
                disabled={!!busy}
                aria-label="Daftar kebutuhan dokumen"
              >
                {inputs.map(({ requirement, files }, index) => {
                  const document = result?.documents.find(
                    (entry) => entry.requirementId === requirement.id,
                  );
                  const inputId = `file-${requirement.id}`;
                  return (
                    <article
                      className={`document-slot ${document?.issues.length ? "has-errors" : ""}`}
                      key={requirement.id}
                      aria-labelledby={`title-${requirement.id}`}
                    >
                      <div className="document-heading">
                        <span className="document-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="document-title">
                          <label
                            className="sr-only"
                            htmlFor={`title-${requirement.id}`}
                          >
                            Nama kebutuhan {index + 1}
                          </label>
                          <input
                            id={`title-${requirement.id}`}
                            className="title-input"
                            value={requirement.title}
                            maxLength={80}
                            onChange={(event) =>
                              changeRequirement(requirement.id, {
                                title: event.target.value,
                              })
                            }
                          />
                          <p>
                            {requirement.required ? "Wajib" : "Opsional"}{" "}
                            <span>·</span>{" "}
                            {requirement.format === "pdf"
                              ? "PDF"
                              : "Format asli"}{" "}
                            <span>·</span> maks.{" "}
                            {Number.isFinite(requirement.maxSizeMB) &&
                            requirement.maxSizeMB > 0
                              ? requirement.maxSizeMB
                              : "—"}{" "}
                            MB
                            {requirement.maxPages
                              ? ` · ${requirement.maxPages} halaman`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="icon-button remove-slot"
                          onClick={() =>
                            changeInputs((previous) =>
                              previous.filter(
                                (input) =>
                                  input.requirement.id !== requirement.id,
                              ),
                            )
                          }
                          disabled={inputs.length === 1 || !!busy}
                          aria-label={`Hapus kebutuhan ${requirement.title || index + 1}`}
                          title="Hapus kebutuhan"
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </div>

                      {files.length > 0 && (
                        <ol
                          className="file-list"
                          aria-label={`Berkas untuk ${requirement.title}`}
                        >
                          {files.map((file, fileIndex) => (
                            <li key={`${fileIndex}-${file.name}-${file.size}`}>
                              <span className="file-symbol">
                                <Icon name="file" size={19} />
                              </span>
                              <span className="file-meta">
                                <strong>{file.name}</strong>
                                <small>
                                  {formatBytes(file.size)}
                                  {files.length > 1
                                    ? ` · urutan ${fileIndex + 1}`
                                    : ""}
                                </small>
                              </span>
                              <div className="file-actions">
                                {files.length > 1 && (
                                  <>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      onClick={() =>
                                        moveFile(requirement.id, fileIndex, -1)
                                      }
                                      disabled={fileIndex === 0 || !!busy}
                                      aria-label={`Pindahkan ${file.name} ke atas`}
                                    >
                                      <Icon name="up" size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      onClick={() =>
                                        moveFile(requirement.id, fileIndex, 1)
                                      }
                                      disabled={
                                        fileIndex === files.length - 1 || !!busy
                                      }
                                      aria-label={`Pindahkan ${file.name} ke bawah`}
                                    >
                                      <Icon name="down" size={16} />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() =>
                                    changeInputs((previous) =>
                                      previous.map((input) =>
                                        input.requirement.id === requirement.id
                                          ? {
                                              ...input,
                                              files: input.files.filter(
                                                (_, removeIndex) =>
                                                  removeIndex !== fileIndex,
                                              ),
                                            }
                                          : input,
                                      ),
                                    )
                                  }
                                  aria-label={`Keluarkan ${file.name}`}
                                >
                                  <Icon name="close" size={16} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      <div
                        className={`file-picker ${files.length ? "compact" : ""}`}
                      >
                        <input
                          className="file-input"
                          id={inputId}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          multiple
                          onChange={(event) => {
                            addFiles(
                              requirement.id,
                              Array.from(event.target.files ?? []),
                            );
                            event.target.value = "";
                          }}
                          aria-describedby={`file-hint-${requirement.id}`}
                        />
                        <label htmlFor={inputId}>
                          <span className="picker-icon">
                            <Icon name="plus" size={19} />
                          </span>
                          <span>
                            {files.length
                              ? "Tambah berkas lagi"
                              : "Pilih berkas dari perangkat"}
                            {!files.length && <small>PDF, JPG, atau PNG</small>}
                          </span>
                        </label>
                      </div>
                      <p
                        id={`file-hint-${requirement.id}`}
                        className="hint file-hint"
                      >
                        {files.length > 1
                          ? "Berkas digabung sesuai urutan di atas untuk hasil PDF."
                          : "Bisa pilih beberapa berkas untuk digabung menjadi satu PDF."}
                      </p>

                      <details className="requirement-settings">
                        <summary>
                          Atur persyaratan & nama hasil{" "}
                          <span aria-hidden="true">+</span>
                        </summary>
                        <div className="settings-grid">
                          <label>
                            Format hasil
                            <select
                              value={requirement.format}
                              onChange={(event) =>
                                changeRequirement(requirement.id, {
                                  format: event.target
                                    .value as Requirement["format"],
                                })
                              }
                            >
                              <option value="pdf">Gabungkan menjadi PDF</option>
                              <option value="original">
                                Pertahankan format asli
                              </option>
                            </select>
                          </label>
                          <label>
                            Batas ukuran (MB)
                            <input
                              type="number"
                              min="0.01"
                              max="20"
                              step="0.01"
                              value={
                                Number.isFinite(requirement.maxSizeMB)
                                  ? requirement.maxSizeMB
                                  : ""
                              }
                              onChange={(event) =>
                                changeRequirement(requirement.id, {
                                  maxSizeMB:
                                    event.target.value === ""
                                      ? NaN
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="output-name">
                            Nama berkas hasil
                            <input
                              value={requirement.outputName}
                              maxLength={120}
                              onChange={(event) =>
                                changeRequirement(requirement.id, {
                                  outputName: event.target.value,
                                })
                              }
                            />
                            <small>
                              Ekstensi seperti .pdf ditambahkan otomatis.
                            </small>
                          </label>
                          <label>
                            Batas halaman (opsional)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              placeholder="Tanpa batas tambahan"
                              value={requirement.maxPages ?? ""}
                              onChange={(event) =>
                                changeRequirement(requirement.id, {
                                  maxPages:
                                    event.target.value === ""
                                      ? undefined
                                      : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={requirement.required}
                              onChange={(event) =>
                                changeRequirement(requirement.id, {
                                  required: event.target.checked,
                                })
                              }
                            />{" "}
                            Dokumen ini wajib ada
                          </label>
                        </div>
                        <p className="hint">
                          Format asli hanya untuk satu berkas. Batas lebih kecil
                          tidak otomatis mengompres PDF.
                        </p>
                      </details>
                      {document && document.issues.length > 0 && (
                        <ul
                          className="slot-errors"
                          aria-label={`Perlu diperbaiki: ${requirement.title}`}
                        >
                          {document.issues.map((issue, issueIndex) => (
                            <li key={`${issue.code}-${issueIndex}`}>
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
                <button
                  type="button"
                  className="add-document"
                  disabled={inputs.length >= 10 || !!busy}
                  onClick={() =>
                    changeInputs((previous) => {
                      const next = makeInputs("sendiri")[0];
                      next.requirement.title = `Dokumen ${previous.length + 1}`;
                      next.requirement.outputName = `dokumen-${previous.length + 1}`;
                      return [...previous, next];
                    })
                  }
                >
                  <Icon name="plus" size={18} />
                  {inputs.length >= 10
                    ? "Maksimal 10 kebutuhan per paket"
                    : "Tambah kebutuhan dokumen"}
                </button>
              </fieldset>
              <p className="limit-note">
                <Icon name="info" size={16} /> PDF berpassword dan bertanda
                tangan digital belum didukung.
              </p>
            </div>

            <aside
              className="summary-column"
              ref={summaryRef}
              tabIndex={-1}
              aria-labelledby="summary-title"
            >
              <div
                className={`summary-panel ${result?.ready ? "is-ready" : ""}`}
              >
                <p className="eyebrow">
                  <span className="section-number">03</span> PERIKSA & UNDUH
                </p>
                <h2 id="summary-title">
                  {result?.ready
                    ? "Paketmu lolos cek."
                    : result
                      ? "Masih perlu dirapikan."
                      : "Berkas lengkap, hati tenang."}
                </h2>
                <p className="summary-description">
                  {result?.ready
                    ? "Lolos pemeriksaan teknis. Lihat isi hasilnya sebelum dikirim ke penerima."
                    : result
                      ? "Periksa catatan di bawah dan pengaturan dokumenmu, lalu coba lagi."
                      : "Kita cek format, ukuran, jumlah halaman, dan berkas yang wajib ada."}
                </p>

                <div className="completion" aria-live="polite">
                  <div>
                    <strong>
                      {populated}
                      <span> / {inputs.length}</span>
                    </strong>
                    <span>kebutuhan terisi</span>
                  </div>
                  <div className="completion-track" aria-hidden="true">
                    <span
                      style={{ width: `${(populated / inputs.length) * 100}%` }}
                    />
                  </div>
                </div>
                <ul className="requirement-checklist">
                  {inputs.map(({ requirement, files }) => (
                    <li key={requirement.id}>
                      <span
                        className={`check-marker ${files.length ? "filled" : ""}`}
                      >
                        {files.length ? (
                          <Icon name="check" size={13} />
                        ) : (
                          <span aria-hidden="true">·</span>
                        )}
                      </span>
                      <span>
                        {requirement.title || "Belum diberi nama"}
                        {!requirement.required && <small>Opsional</small>}
                      </span>
                      <span className="check-state">
                        {files.length
                          ? "Terisi"
                          : requirement.required
                            ? "Belum ada"
                            : "Boleh kosong"}
                      </span>
                    </li>
                  ))}
                </ul>
                {!result && (
                  <p className="summary-hint">
                    {!hasFiles
                      ? "Tambahkan berkas untuk mulai memeriksa."
                      : missing
                      ? `${missing} dokumen wajib belum ditambahkan.`
                      : "Sudah terisi. Berikutnya, periksa hasil berkasmu."}
                  </p>
                )}

                {result && (
                  <div
                    className={`check-result ${result.ready ? "success" : "warning"}`}
                    role="status"
                  >
                    <Icon name={result.ready ? "check" : "info"} size={20} />
                    <p>
                      <strong>
                        {result.ready
                          ? `${checkedDocuments.length} berkas hasil lolos cek`
                          : "Paket belum siap diunduh"}
                      </strong>
                      <span>
                        {result.ready
                          ? "Format, ukuran, dan halaman sudah diperiksa ulang pada hasil akhir."
                          : "Berkas yang bermasalah tidak akan masuk paket unduhan."}
                      </span>
                    </p>
                  </div>
                )}
                {result && result.issues.length > 0 && (
                  <ul className="package-errors">
                    {result.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                )}
                {error && (
                  <p className="error-banner" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="primary-button"
                  disabled={!!busy}
                  onClick={result?.ready ? downloadPackage : checkPackage}
                >
                  <Icon name={result?.ready ? "download" : "check"} size={19} />
                  {busy === "prepare"
                    ? "Memeriksa & menyiapkan…"
                    : busy === "download"
                      ? "Membuat paket…"
                      : busy === "demo"
                        ? "Menyiapkan contoh…"
                        : result?.ready
                          ? "Unduh paket .zip"
                          : result
                            ? "Periksa ulang berkas"
                            : "Periksa berkas"}
                </button>
                <p className="download-note">
                  {result?.ready
                    ? "ZIP untuk simpanan. Untuk portal, gunakan berkas satu per satu di bawah."
                    : "Berkas asli tetap utuh. Tidak ada yang dikirim ke server."}
                </p>

                {result && checkedDocuments.length > 0 && (
                  <section
                    className="output-list"
                    aria-labelledby="output-title"
                  >
                    <h3 id="output-title">Berkas hasil</h3>
                    {checkedDocuments.map((document) => (
                      <article key={document.requirementId}>
                        <div className="output-meta">
                          <Icon name="file" size={20} />
                          <div>
                            <strong>{document.filename}</strong>
                            <span>
                              {formatBytes(document.bytes.byteLength)} ·{" "}
                              {document.pageCount} halaman
                            </span>
                          </div>
                        </div>
                        <div className="output-actions">
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => setPreview(document)}
                            disabled={!!busy}
                          >
                            <Icon name="eye" size={16} /> Lihat hasil
                          </button>
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => downloadDocument(document)}
                            disabled={!!busy}
                            aria-label={`Unduh ${document.filename}`}
                          >
                            <Icon name="download" size={16} /> Unduh
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                )}
              </div>
              <div className="below-summary">
                <button
                  type="button"
                  className="text-button reset-button"
                  disabled={!!busy}
                  onClick={reset}
                >
                  Mulai ulang
                </button>
                <p>
                  Menutup atau memuat ulang halaman akan mengosongkan berkas di
                  sini.
                </p>
              </div>
            </aside>
          </section>
        </main>
        <footer className="site-footer">
          <span className="footer-brand">
            BerkasSiap<span>Urus dokumen, secukupnya.</span>
          </span>
          <p>
            Pemeriksaan teknis berdasarkan aturan yang kamu masukkan.
            <br />
            Bukan pemeriksaan isi atau jaminan diterima oleh tujuan pengiriman.
          </p>
        </footer>
      </div>
      {preview && (
        <DocumentPreview document={preview} onClose={() => setPreview(null)} />
      )}
      {confirmation && <ReplaceConfirmation onDecision={(answer) => {
        confirmation(answer);
        setConfirmation(null);
      }} />}
    </>
  );
}
