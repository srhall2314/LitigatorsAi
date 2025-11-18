import { put, list, head, del } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '@/lib/env';

export interface BlobUploadOptions {
  addRandomSuffix?: boolean;
  cacheControlMaxAge?: number;
  contentType?: string;
}

export async function uploadBlob(
  filename: string,
  body: string | Blob | ArrayBuffer | ReadableStream<Uint8Array>,
  options?: BlobUploadOptions
) {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  // Convert FormData to ArrayBuffer if needed (handled by caller)
  const bodyToUpload: string | Blob | ArrayBuffer | ReadableStream<Uint8Array> = body;

  // Ensure access is always 'public' as that's the only supported value
  const access: 'public' = 'public';

  return await put(filename, bodyToUpload, {
    access,
    token: BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: options?.addRandomSuffix ?? true,
    cacheControlMaxAge: options?.cacheControlMaxAge,
    contentType: options?.contentType,
  });
}

export async function listBlobs(prefix?: string) {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return await list({
    prefix,
    token: BLOB_READ_WRITE_TOKEN,
  });
}

export async function getBlob(url: string) {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return await head(url, {
    token: BLOB_READ_WRITE_TOKEN,
  });
}

export async function deleteBlob(url: string) {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return await del(url, {
    token: BLOB_READ_WRITE_TOKEN,
  });
}

