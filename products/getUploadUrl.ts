import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { IMAGE_BUCKET } from "../shared/db";
import { ok, badReq, forbidden, internal } from "../shared/response";
import { getCaller } from "../shared/auth";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const caller = getCaller(e);

    if (!caller.sub) {
      return forbidden("認証情報が見つかりません");
    }

    if (!caller.isSeller) {
      return forbidden("出品者権限が必要です");
    }

    const query = e.queryStringParameters || {};
    const fileName = query.fileName;
    const contentType = query.contentType;
    const fileSize = Number(query.fileSize);

    if (!fileName || !contentType) {
      return badReq("クエリパラメータ fileName と contentType は必須です");
    }

    const ext = EXTENSION_BY_CONTENT_TYPE[contentType];
    if (!ext) {
      return badReq("画像は JPEG または PNG 形式を選択してください");
    }

    if (
      !Number.isInteger(fileSize) ||
      fileSize < 1 ||
      fileSize > MAX_IMAGE_BYTES
    ) {
      return badReq("画像サイズは 5MB 以下にしてください");
    }

    const imageKey = `uploads/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: imageKey,
      ContentType: contentType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-length"]),
    });

    return ok({
      uploadUrl,
      imageKey,
    });
  } catch (err: any) {
    console.error("getUploadUrl エラー:", err);
    return internal();
  }
};
