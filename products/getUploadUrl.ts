import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { IMAGE_BUCKET } from "../shared/db";
import { ok, badReq, forbidden, internal } from "../shared/response";

// S3 クライアントの初期化（バージニア北部: us-east-1）
// ※チェックサム自動計算をオフにして、不要な CRC32 付与による 403 エラーを防止
const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// 許可する Content-Type のホワイトリスト
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
    // 1. 出品者権限（seller グループ）の検証
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

    // 2. クエリパラメータの取得とバリデーション
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

    // 3. 拡張子の抽出とユニークな S3 Key (uploads/{uuid}.{ext}) の生成
    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch
      ? extMatch[1].toLowerCase()
      : contentType === "image/png"
        ? "png"
        : "jpg";
    const imageKey = `uploads/${randomUUID()}.${ext}`;

    // 4. Presigned URL の生成（有効期限: 300秒 = 5分）
    const command = new PutObjectCommand({
      Bucket: IMAGE_BUCKET,
      Key: imageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // 5. レスポンス返却
    return ok({
      uploadUrl,
      imageKey,
    });
  } catch (err: any) {
    console.error("getUploadUrl エラー:", err);
    return internal();
  }
};
