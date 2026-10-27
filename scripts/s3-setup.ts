// Verifies S3 access and creates the project "folder" (prefix marker) in the
// shared bucket. Only ever writes the single key `${S3_KEY_PREFIX}/`.
// Usage: npm run storage:check   (read-only)
//        npm run storage:setup   (creates the folder marker if missing)
import { loadEnvConfig } from "@next/env";
import { HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

loadEnvConfig(process.cwd());

async function main() {
  const create = process.argv.includes("--create");
  const { AWS_REGION, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;
  const prefix = `${process.env.S3_KEY_PREFIX || "ss-dimri"}/`;
  if (!AWS_REGION || !AWS_BUCKET_NAME || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS_* environment variables are not fully set");
  }
  const s3 = new S3Client({
    region: AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  });

  await s3.send(new HeadBucketCommand({ Bucket: AWS_BUCKET_NAME }));
  console.log(`Bucket reachable: ${AWS_BUCKET_NAME} (${AWS_REGION})`);

  const existing = await s3.send(new ListObjectsV2Command({ Bucket: AWS_BUCKET_NAME, Prefix: prefix, MaxKeys: 5 }));
  const count = existing.KeyCount ?? 0;
  console.log(`Objects under "${prefix}": ${count}${existing.IsTruncated ? "+" : ""}`);

  if (count > 0) {
    console.log("Project folder already exists — nothing to create.");
    return;
  }
  if (!create) {
    console.log("Project folder does not exist yet. Run with --create to create it.");
    return;
  }
  await s3.send(new PutObjectCommand({ Bucket: AWS_BUCKET_NAME, Key: prefix, Body: new Uint8Array(0), ContentLength: 0, ServerSideEncryption: "AES256" }));
  console.log(`Created folder marker "${prefix}".`);
}

main().catch((e) => {
  console.error("S3 check failed:", e?.name ?? "Error", "-", e?.message ?? "unknown error");
  process.exit(1);
});
