import "server-only";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@/lib/env";

// Private document storage. Everything for this project lives under
// `${S3_KEY_PREFIX}/` in the shared bucket. Objects are never public; access
// is through short-lived pre-signed URLs issued after an authorization check.

export type StorageArea =
  | "organizations"
  | "clients"
  | "employees"
  | "tasks"
  | "attendance"
  | "reports";

let client: S3Client | undefined;

export function s3() {
  if (!client) {
    const env = serverEnv();
    client = new S3Client({
      region: env.AWS_REGION,
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

/**
 * Build an object key such as
 * `ss-dimri/org/<orgId>/employees/<ownerId>/<uuid>.pdf`.
 * The original file name is kept only in stored_files.original_file_name.
 */
export function buildObjectKey(opts: {
  organizationId: string;
  area: StorageArea;
  ownerId: string;
  fileName: string;
}) {
  const ext = opts.fileName.includes(".")
    ? "." + opts.fileName.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)
    : "";
  return `${serverEnv().S3_KEY_PREFIX}/org/${opts.organizationId}/${opts.area}/${opts.ownerId}/${randomUUID()}${ext}`;
}

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export async function createUploadUrl(objectKey: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: serverEnv().AWS_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(s3(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export async function createDownloadUrl(objectKey: string, downloadName?: string) {
  const command = new GetObjectCommand({
    Bucket: serverEnv().AWS_BUCKET_NAME,
    Key: objectKey,
    ResponseContentDisposition: downloadName
      ? `attachment; filename="${downloadName.replace(/["\\\r\n]/g, "_")}"`
      : undefined,
  });
  return getSignedUrl(s3(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}
