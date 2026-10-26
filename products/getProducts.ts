import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { db, PRODUCTS_TABLE } from "../shared/db";
import { ok, internal } from "../shared/response";

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const category = e.queryStringParameters?.category;
    const limitParam = e.queryStringParameters?.limit;
    const limit = limitParam ? Number(limitParam) : undefined;

    if (category) {
      const r = await db.send(
        new QueryCommand({
          TableName: PRODUCTS_TABLE,
          IndexName: "category-createdAt-index",
          KeyConditionExpression: "category = :cat",
          ExpressionAttributeValues: { ":cat": category },
          ...(limit ? { Limit: limit } : {}),
          ScanIndexForward: false,
        }),
      );
      const items = r.Items ?? [];
      return ok({ items, count: items.length });
    }

    const r = await db.send(new ScanCommand({ TableName: PRODUCTS_TABLE }));
    const sorted = (r.Items ?? []).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const items = limit ? sorted.slice(0, limit) : sorted;
    return ok({ items, count: items.length });
  } catch (err) {
    console.error(err);
    return internal();
  }
};
