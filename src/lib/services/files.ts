import "server-only";
import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { BusinessRuleError } from "@/lib/actions";
import { buildObjectKey, s3, type StorageArea } from "@/lib/storage/s3";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Allowed types are identified by their leading bytes, not by the file name or
// the browser-supplied MIME type.
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  {
    // .docx / .xlsx are ZIP containers; accept only with a matching extension.
    mime: "application/zip-office",
    ext: "office",
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  },
];

const OFFICE_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function detectFileType(buf: Buffer, fileName: string): { mime: string; ext: string } | null {
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig) return null;
  if (sig.ext === "office") {
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    return OFFICE_TYPES[ext] ? { mime: OFFICE_TYPES[ext], ext } : null;
  }
  return { mime: sig.mime, ext: sig.ext };
}

/** True when the form field holds an actual file (browsers send an empty File when none is chosen). */
export function hasFile(v: unknown): v is File {
  return typeof File !== "undefined" && v instanceof File && v.size > 0;
}

/** Who an upload belongs to: a signed-in context, or a just-created registrant. */
export type UploadOwner = { organization: { id: string }; user: { id: string } };

/**
 * Checks size and real file type (from content) without storing anything, so a
 * form can reject a bad file before it creates any records.
 */
export async function validateUpload(file: File, opts: { imagesOnly?: boolean } = {}) {
  if (file.size > MAX_UPLOAD_BYTES) throw new BusinessRuleError(`“${file.name}” is larger than 10 MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(buf, file.name);
  if (!type) throw new BusinessRuleError(`“${file.name}” is not a supported file. Upload a PDF, JPG, PNG, WEBP, DOCX or XLSX file.`);
  if (opts.imagesOnly && !type.mime.startsWith("image/")) throw new BusinessRuleError(`“${file.name}” must be an image (JPG, PNG or WEBP).`);
  return { buf, type };
}

/**
 * Validate and store an upload in private S3, returning the stored_files row.
 * Images only when `imagesOnly` (profile pictures, live attendance photos).
 */
export async function storeUpload(
  ctx: UploadOwner,
  file: File,
  opts: { area: StorageArea; ownerId: string; imagesOnly?: boolean },
) {
  const { buf, type } = await validateUpload(file, opts);

  const objectKey = buildObjectKey({
    organizationId: ctx.organization.id,
    area: opts.area,
    ownerId: opts.ownerId,
    fileName: `upload.${type.ext}`,
  });
  await s3().send(
    new PutObjectCommand({
      Bucket: serverEnv().AWS_BUCKET_NAME,
      Key: objectKey,
      Body: buf,
      ContentType: type.mime,
      ServerSideEncryption: "AES256",
    }),
  );
  return prisma.storedFile.create({
    data: {
      organizationId: ctx.organization.id,
      bucket: serverEnv().AWS_BUCKET_NAME,
      objectKey,
      originalFileName: file.name.slice(0, 200),
      mimeType: type.mime,
      sizeBytes: BigInt(buf.length),
      checksumSha256: createHash("sha256").update(buf).digest("hex"),
      uploadedById: ctx.user.id,
    },
  });
}

/** Store a file the system produced (e.g. an issued HR letter) in private S3. */
export async function storeGenerated(
  ctx: UploadOwner,
  buf: Uint8Array,
  opts: { area: StorageArea; ownerId: string; fileName: string; mimeType: string },
) {
  const objectKey = buildObjectKey({ organizationId: ctx.organization.id, area: opts.area, ownerId: opts.ownerId, fileName: opts.fileName });
  await s3().send(
    new PutObjectCommand({ Bucket: serverEnv().AWS_BUCKET_NAME, Key: objectKey, Body: buf, ContentType: opts.mimeType, ServerSideEncryption: "AES256" }),
  );
  return prisma.storedFile.create({
    data: {
      organizationId: ctx.organization.id,
      bucket: serverEnv().AWS_BUCKET_NAME,
      objectKey,
      originalFileName: opts.fileName.slice(0, 200),
      mimeType: opts.mimeType,
      sizeBytes: BigInt(buf.length),
      checksumSha256: createHash("sha256").update(buf).digest("hex"),
      uploadedById: ctx.user.id,
    },
  });
}
