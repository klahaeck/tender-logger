import "server-only";

import { del, get, put } from "@vercel/blob";

declare global {
  var __parentingFileStore: Map<string, { body: Uint8Array; contentType: string }> | undefined;
}

function memoryStore() {
  globalThis.__parentingFileStore ??= new Map();
  return globalThis.__parentingFileStore;
}

export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

export async function putPrivateFile(
  pathname: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  if (!blobConfigured()) {
    memoryStore().set(pathname, { body: new Uint8Array(body), contentType });
    return pathname;
  }
  const result = await put(pathname, Buffer.from(body), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    cacheControlMaxAge: 60,
  });
  return result.pathname;
}

export async function getPrivateFile(
  pathname: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!blobConfigured()) return memoryStore().get(pathname) ?? null;
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) return null;
  const body = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return {
    body,
    contentType: result.blob.contentType ?? "application/octet-stream",
  };
}

export async function deletePrivateFiles(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;
  if (!blobConfigured()) {
    for (const pathname of pathnames) memoryStore().delete(pathname);
    return;
  }
  await del(pathnames);
}
