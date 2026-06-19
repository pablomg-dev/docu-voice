/**
 * Downloads a binary resource from the given URL as a file.
 * Fetches the data as a Blob first, then uses createObjectURL so the
 * browser never confuses the download with the audio element's stream
 * (which shares the same endpoint). Includes cache-busting.
 */
export async function downloadBlob(
  url: string,
  filename: string,
): Promise<void> {
  const cacheBuster = url.includes("?") ? "&t=" : "?t=";
  const res = await fetch(`${url}${cacheBuster}${Date.now()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Download failed (HTTP ${res.status}): ${text}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser time to start the download before revoking the blob URL
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
