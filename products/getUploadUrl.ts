import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { IMAGE_BUCKET } from "../shared/db";
import { ok, badReq, forbidden, internal } from "../shared/response";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const claims = e.requestContext.authorizer?.claims;
    const sellerId = claims?.sub;
    const groupsRaw = claims?.["cognito:groups"];
    const groups = Array.isArray(groupsRaw)
      ? groupsRaw
      : typeof groupsRaw === "string"
        ? [groupsRaw]
        : [];

    if (!sellerId) {
      return forbidden("認証情報が見つかりません");
    }

    if (!groups.includes("seller")) {
      return forbidden("出品者権限が必要です");
    }

    const query = e.queryStringParameters || {};
    const fileName = query.fileName;
    const contentType = query.contentType;

    if (!fileName || !contentType) {
      return badReq("クエリパラメータ fileName と contentType は必須です");
    }

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return badReq(
        `許可されていないファイル形式です。許可形式: ${ALLOWED_CONTENT_TYPES.join(
          ", ",
        )}`,
      );
    }

    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch
      ? extMatch[1].toLowerCase()
      : contentType === "image/png"
        ? "png"
        : "jpg";
    const imageKey = `uploads/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: imageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return ok({
      uploadUrl,
      imageKey,
    });
  } catch (err: any) {
    console.error("getUploadUrl エラー:", err);
    return internal();
  }
};
