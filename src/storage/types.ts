export interface StoredImage {
  /** URL the browser can load: a same-origin path for local files, an absolute URL for remote stores. */
  url: string;
}

/** Where sanitized report photos live. Paired with a ReportRepository by the storage factory. */
export interface ImageStore {
  init(): Promise<void>;
  /** Persists an already-sanitized JPEG and returns its public URL. */
  save(jpeg: Buffer): Promise<StoredImage>;
  /** Best-effort removal, used to roll back when the report insert fails. */
  remove(url: string): Promise<void>;
  /** Origin to allow in the page's img-src CSP, or null when images are same-origin. */
  readonly publicOrigin: string | null;
}
