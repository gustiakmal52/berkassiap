export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(bytes / 1_000)} kB`;
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(bytes / 1_000_000)} MB`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
