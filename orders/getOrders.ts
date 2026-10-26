import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, ORDERS_TABLE } from "../shared/db";
import { ok, forbidden, internal } from "../shared/response";

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const buyerId = e.requestContext.authorizer?.claims?.sub;
    if (!buyerId) {
      return forbidden("Unauthorized: buyer ID not found");
    }

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
