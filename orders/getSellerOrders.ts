import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ORDERS_TABLE } from "../shared/db";
import { ok, forbidden, internal } from "../shared/response";
import { getCaller } from "../shared/auth";
import { queryAll } from "../shared/paginate";

export const handler = async (
  e: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const caller = getCaller(e);

    if (!caller.sub) {
      return forbidden("認証情報が見つかりません");
    }

    if (!caller.isSeller) {
      return forbidden("出品者権限が必要です");
    }

    const items = await queryAll({
      TableName: ORDERS_TABLE,
      IndexName: "sellerId-createdAt-index",
      KeyConditionExpression: "sellerId = :sellerId",
      ExpressionAttributeValues: {
        ":sellerId": caller.sub,
      },
      ScanIndexForward: false,
    });

    return ok({ items, count: items.length });
  } catch (err: any) {
    console.error("getSellerOrders エラー:", err);
    return internal();
  }
};
