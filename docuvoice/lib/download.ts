export async function downloadBlob(
  url: string,
  filename: string,
  options: { revokeDelayMs?: number } = {},
): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${filename}: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  const revokeDelayMs = options.revokeDelayMs ?? 1000;
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, revokeDelayMs);
}
