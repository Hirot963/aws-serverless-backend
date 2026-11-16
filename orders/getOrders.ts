import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ORDERS_TABLE } from "../shared/db";
import { ok, forbidden, internal } from "../shared/response";
import { getCaller } from "../shared/auth";
import { queryAll } from "../shared/paginate";

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const buyerId = getCaller(e).sub;
    if (!buyerId) {
      return forbidden("認証情報が見つかりません");
    }

    const items = await queryAll({
      TableName: ORDERS_TABLE,
      KeyConditionExpression: "buyerId = :buyerId",
      ExpressionAttributeValues: {
        ":buyerId": buyerId,
      },
    });

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
