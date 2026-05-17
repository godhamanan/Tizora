import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export const r2Enabled = process.env.USE_CLOUD_STORAGE === 'true';

const client = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    })
  : null;

export async function uploadImage(buffer: Buffer, mimeType: string, userId: string): Promise<string> {
  if (!client) throw new Error('R2 storage is not enabled (USE_CLOUD_STORAGE != true)');
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const key = `clothes/${userId}/input/${randomUUID()}.${ext}`;
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
