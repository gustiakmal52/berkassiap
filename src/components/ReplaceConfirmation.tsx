import { useEffect, useRef } from 'react';
import './confirmation.css';

export function ReplaceConfirmation({ onDecision }: { onDecision: (answer: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="replace-confirmation" aria-labelledby="replace-title" aria-describedby="replace-description" onCancel={event => { event.preventDefault(); onDecision(false); }}>
    <h2 id="replace-title">Ganti pilihan berkas?</h2>
    <p id="replace-description">Pilihan dan hasil di halaman ini akan dikosongkan. Unduh hasilmu dulu jika masih diperlukan. Berkas asli di perangkatmu tidak dihapus.</p>
    <div>
      <button type="button" autoFocus onClick={() => onDecision(false)}>Batal, tetap di sini</button>
      <button type="button" onClick={() => onDecision(true)}>Ya, lanjutkan</button>
    </div>
  </dialog>;
}
