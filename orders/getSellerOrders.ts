import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, ORDERS_TABLE } from "../shared/db";
import { ok, forbidden, internal } from "../shared/response";

export const handler = async (
  e: APIGatewayProxyEvent
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

    const result = await db.send(
      new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: "sellerId-createdAt-index",
        KeyConditionExpression: "sellerId = :sellerId",
        ExpressionAttributeValues: {
          ":sellerId": sellerId,
        },
        ScanIndexForward: false,
      })
    );

    const items = result.Items ?? [];

    return ok({ items, count: items.length });
  } catch (err: any) {
    console.error("getSellerOrders エラー:", err);
    return internal();
  }
};
