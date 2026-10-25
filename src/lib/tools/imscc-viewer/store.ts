/**
 * Reading files out of a Canvas course export.
 *
 * A course export arrives either as a ZIP (`.imscc`, or a `.zip` that is the
 * same thing renamed) or as an already-extracted folder. Both are exposed
 * through the same {@link FileStore} interface so the parser does not care
 * which one it got.
 *
 * Files are read on demand: a course export can carry hundreds of megabytes
 * of video, and the viewer never needs most of it in memory at once.
 */
import JSZip from "jszip";

/** The name of the manifest that marks the root of a Common Cartridge. */
const MANIFEST_NAME = "imsmanifest.xml";

/** Read access to the files of one cartridge. */
export interface FileStore {
  /** Every file path in the cartridge, relative to the cartridge root. */
  paths(): string[];
  /** Read a file as UTF-8 text, or `undefined` when it is not there. */
  text(path: string): Promise<string | undefined>;
  /** Read a file as a blob, or `undefined` when it is not there. */
  blob(path: string): Promise<Blob | undefined>;
}

/** A file together with the path it has inside the cartridge. */
export interface CollectedFile {
  /** Path relative to the folder the user picked or dropped. */
  path: string;
  file: File;
}

/**
 * Find the folder that holds the cartridge manifest.
 *
 * Canvas exports are usually zipped with the cartridge at the root, but a
 * folder picked from disk has one extra level — `AP_Calculus_AB/imsmanifest.xml`.
 * The shallowest manifest wins, so a nested course inside a bigger folder is
 * still found.
 *
 * @returns The prefix to strip from every path, `""` when the cartridge is at
 *   the root, or `undefined` when no manifest is present.
 */
export function locateCartridgeRoot(paths: readonly string[]): string | undefined {
  const candidates = paths
    .filter((path) => path === MANIFEST_NAME || path.endsWith(`/${MANIFEST_NAME}`))
    .sort((a, b) => a.length - b.length);

  const best = candidates[0];
  if (!best) return undefined;
  return best.slice(0, best.length - MANIFEST_NAME.length);
}

/** A cartridge read from a ZIP archive. */
class ZipStore implements FileStore {
  private constructor(
    private readonly zip: JSZip,
    private readonly root: string,
  ) {}

  /** Open a ZIP archive and locate the cartridge inside it. */
  static async open(source: Blob): Promise<ZipStore> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(source);
    } catch {
      throw new Error("That file could not be read as a ZIP archive.");
    }

    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    const root = locateCartridgeRoot(names);
    if (root === undefined) {
      throw new Error(`No ${MANIFEST_NAME} was found in the archive, so this is not a Canvas course export.`);
    }

    return new ZipStore(zip, root);
  }

  paths(): string[] {
    return Object.keys(this.zip.files)
      .filter((name) => !this.zip.files[name].dir)
      .map((name) => (name.startsWith(this.root) ? name.slice(this.root.length) : name));
  }

  async text(path: string): Promise<string | undefined> {
    const entry = this.zip.file(this.root + path);
    if (!entry || entry.dir) return undefined;
    return entry.async("string");
  }

  async blob(path: string): Promise<Blob | undefined> {
    const entry = this.zip.file(this.root + path);
    if (!entry || entry.dir) return undefined;
    return entry.async("blob");
  }
}

/** A cartridge read from an extracted folder. */
class FolderStore implements FileStore {
  private readonly files: Map<string, File>;

  constructor(files: CollectedFile[]) {
    const root = locateCartridgeRoot(files.map((entry) => entry.path));
    if (root === undefined) {
      throw new Error(`No ${MANIFEST_NAME} was found in the folder, so this is not a Canvas course export.`);
    }

    this.files = new Map();
    for (const { path, file } of files) {
      if (!path.startsWith(root)) continue;
      this.files.set(path.slice(root.length), file);
    }
  }

  paths(): string[] {
    return Array.from(this.files.keys());
  }

  async text(path: string): Promise<string | undefined> {
    const file = this.files.get(path);
    if (!file) return undefined;
    return file.text();
  }

  async blob(path: string): Promise<Blob | undefined> {
    return this.files.get(path);
  }
}

/**
 * Open a cartridge from a ZIP archive or an extracted folder.
 *
 * @param source The ZIP file, or the files of an extracted folder.
 */
export async function openCartridge(source: File | CollectedFile[]): Promise<FileStore> {
  if (Array.isArray(source)) return new FolderStore(source);
  return ZipStore.open(source);
}

/** Collect the files chosen through a file input. */
export function filesFromInput(input: HTMLInputElement): CollectedFile[] {
  const files = Array.from(input.files ?? []);
  return files.map((file) => ({
    path: file.webkitRelativePath || file.name,
    file,
  }));
}

/**
 * Collect the files dropped onto a target.
 *
 * Dropped folders are walked recursively. The browser only reveals one batch
 * of entries per `readEntries` call, so the walk has to keep asking until the
 * reader comes back empty.
 */
export async function filesFromDrop(event: DragEvent): Promise<CollectedFile[]> {
  const items = Array.from(event.dataTransfer?.items ?? []);
  const out: CollectedFile[] = [];

  for (const item of items) {
    if (item.kind !== "file") continue;

    const entry = item.webkitGetAsEntry();
    if (!entry) {
      // No directory API (older Safari): fall back to the flat file list.
      const file = item.getAsFile();
      if (file) out.push({ path: file.name, file });
      continue;
    }

    if (entry.isFile) {
      const file = await fileFromEntry(entry as FileSystemFileEntry);
      if (file) out.push({ path: entry.name, file });
    } else if (entry.isDirectory) {
      await walkDirectory(entry as FileSystemDirectoryEntry, `${entry.name}/`, out);
    }
  }

  if (out.length === 0) {
    // Some browsers expose dropped files only through `dataTransfer.files`.
    for (const file of Array.from(event.dataTransfer?.files ?? [])) {
      out.push({ path: file.name, file });
    }
  }

  return out;
}

/** Read one file out of a dropped directory entry. */
function fileFromEntry(entry: FileSystemFileEntry): Promise<File | undefined> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(undefined),
    );
  });
}

/** Walk a dropped directory, collecting every file beneath it. */
async function walkDirectory(entry: FileSystemDirectoryEntry, prefix: string, out: CollectedFile[]): Promise<void> {
  const reader = entry.createReader();

  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    if (batch.length === 0) break;

    for (const child of batch) {
      const path = `${prefix}${child.name}`;
      if (child.isFile) {
        const file = await fileFromEntry(child as FileSystemFileEntry);
        if (file) out.push({ path, file });
      } else if (child.isDirectory) {
        await walkDirectory(child as FileSystemDirectoryEntry, `${path}/`, out);
      }
    }
  }
}
