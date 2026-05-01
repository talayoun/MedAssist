import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

const endpoint = process.env.AWS_ENDPOINT_URL;

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'eu-west-1',
  ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = (process.env.AWS_S3_BUCKET ?? process.env.AWS_BUCKET_NAME)!;
const MAX_BYTES = 200 * 1024;
const isLocalStack = !!endpoint;

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured || !isLocalStack) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  bucketEnsured = true;
}

export async function uploadStepImage(buffer: Buffer, mimeType: string): Promise<string> {
  const compressed = await sharp(buffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const finalBuffer = compressed.length <= MAX_BYTES
    ? compressed
    : await sharp(compressed).jpeg({ quality: Math.floor(80 * MAX_BYTES / compressed.length) }).toBuffer();

  const key = `nav-steps/${randomUUID()}.jpg`;
  await ensureBucket();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: finalBuffer,
    ContentType: 'image/jpeg',
    ...(isLocalStack ? {} : { ACL: 'public-read' }),
  }));

  if (isLocalStack) return `${endpoint}/${BUCKET}/${key}`;
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function presignGet(
  key: string | null | undefined,
  ttlSeconds = 900,
): Promise<string | null> {
  if (!key) return null;
  await ensureBucket();
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  await ensureBucket();
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const { Body } = await s3.send(cmd);
  const readable = Body as Readable;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (chunk: Buffer) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

export async function uploadEncrypted(
  key: string,
  buffer: Buffer,
  contentType: string,
  contentDisposition: 'attachment' | 'inline' = 'attachment',
): Promise<void> {
  await ensureBucket();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
    ...(isLocalStack ? {} : { ServerSideEncryption: 'AES256' }),
  }));
}
