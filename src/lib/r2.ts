/**
 * Cloudflare R2 storage client (S3-compatible API).
 *
 * Replaces Vercel Blob for image uploads. Falls back to local disk when
 * R2 credentials are absent (same behavior as the old BLOB_READ_WRITE_TOKEN check).
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { servicesConfig } from "@/lib/config/services";

export function isR2Enabled(): boolean {
  return !!(
    servicesConfig.r2AccountId() &&
    servicesConfig.r2AccessKeyId() &&
    servicesConfig.r2SecretAccessKey() &&
    servicesConfig.r2BucketName()
  );
}

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${servicesConfig.r2AccountId()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: servicesConfig.r2AccessKeyId()!,
      secretAccessKey: servicesConfig.r2SecretAccessKey()!,
    },
  });
}

function getBucket(): string {
  return servicesConfig.r2BucketName()!;
}

function getPublicUrl(key: string): string {
  const base = servicesConfig.r2PublicUrl()?.replace(/\/$/, "") ?? "";
  return `${base}/${key}`;
}

/** Upload a buffer to R2 and return the public URL. */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  const client = getClient();
  // Without an explicit ContentType, R2 stores the object as
  // application/octet-stream, which breaks image content-type validation and
  // some clients. Derive it from the key's extension as a sensible default.
  const resolvedContentType = contentType ?? extToContentType(getExtFromKey(key));
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: resolvedContentType,
    })
  );
  return getPublicUrl(key);
}

/** Delete every object whose key starts with `prefix`. */
export async function deleteByPrefix(prefix: string): Promise<void> {
  const client = getClient();
  const { Contents } = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: prefix,
    })
  );
  if (Contents && Contents.length > 0) {
    await Promise.all(
      Contents.map((obj) =>
        client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: obj.Key! })).catch(() => {})
      )
    );
  }
}

const EXT_MIME: Record<string, string> = {
  webp: "image/webp",
  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

export function extToContentType(ext: string): string | undefined {
  return EXT_MIME[ext.toLowerCase()];
}

/** Extract the lowercase file extension from a storage key (no leading dot). */
function getExtFromKey(key: string): string {
  const lastDot = key.lastIndexOf(".");
  if (lastDot < 0 || lastDot === key.length - 1) return "";
  return key.slice(lastDot + 1).toLowerCase();
}

/** Delete a single file by its full public URL. */
export async function deleteFileByUrl(url: string): Promise<void> {
  const client = getClient();
  const base = servicesConfig.r2PublicUrl()?.replace(/\/$/, "") ?? "";
  if (!base || !url.startsWith(base)) return;
  const key = url.slice(base.length + 1);
  await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}
