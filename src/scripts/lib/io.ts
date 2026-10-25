import { toast } from "@starwind-ui/runtime/toast";

/** Trigger a download of `content` as a file. */
export function download(content: string, filename: string, mimeType = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy text to the clipboard, reporting the outcome. */
export async function copyToClipboard(text: string, label = "Content"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error("Copy failed", {
      description: "Your browser blocked clipboard access — use Download instead.",
    });
  }
}
