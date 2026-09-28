import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, ORDERS_TABLE } from "../shared/db";
import { ok, forbidden, internal } from "../shared/response";

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // 1. 購入者 ID（Cognito sub）の取得
    const buyerId = e.requestContext.authorizer?.claims?.sub;
    if (!buyerId) {
      return forbidden("Unauthorized: buyer ID not found");
    }

    // 2. DynamoDB から自分の注文履歴を取得（PK: buyerId）
    const result = await db.send(
      new QueryCommand({
        TableName: ORDERS_TABLE,
        KeyConditionExpression: "buyerId = :buyerId",
        ExpressionAttributeValues: {
          ":buyerId": buyerId,
        },
      }),
    );

    const items = result.Items ?? [];

    // 3. 注文日時（createdAt）の新しい順にソート
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return ok({ items, count: items.length });
  } catch (err: any) {
    console.error("getOrders エラー:", err);
    return internal();
  }
};
