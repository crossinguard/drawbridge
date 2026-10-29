/**
 * Reading files out of a Canvas course export.
 *
 * A Canvas course export arrives as an `.imscc` file whose contents use the
 * ZIP format.
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

/**
 * Find the folder that holds the cartridge manifest.
 *
 * Canvas exports are usually zipped with the cartridge at the root, but some
 * tools add a folder around it. The shallowest manifest wins, so a nested
 * course inside a bigger folder is still found.
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

/**
 * Open a cartridge from a ZIP archive.
 *
 * @param source The `.imscc` Canvas course export.
 */
export async function openCartridge(source: File): Promise<FileStore> {
  return ZipStore.open(source);
}
