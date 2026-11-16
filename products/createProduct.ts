import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { db, PRODUCTS_TABLE } from "../shared/db";
import { created, badReq, forbidden, internal } from "../shared/response";
import { getCaller, parseJsonBody } from "../shared/auth";
import { parseProductInput } from "../shared/productInput";

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

    const body = parseJsonBody(e.body);
    if (!body.ok) {
      return badReq("JSON の形式が不正です");
    }

    const input = parseProductInput(body.value);
    if (!input.ok) {
      return badReq(input.message);
    }

    const { name, price, category, stock, imageKey, imageUrl } = input.value;

    const item: Record<string, any> = {
      sellerId: caller.sub,
      productId: randomUUID(),
      name,
      price,
      category,
      stock,
      createdAt: new Date().toISOString(),
    };

    if (imageKey && imageUrl) {
      item.imageKey = imageKey;
      item.imageUrl = imageUrl;
    }

    await db.send(
      new PutCommand({
        TableName: PRODUCTS_TABLE,
        Item: item,
      })
    );

    return created(item);
  } catch (err: any) {
    console.error("createProduct エラー:", err);
    return internal();
  }
};
