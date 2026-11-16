import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, PRODUCTS_TABLE } from "../shared/db";
import {
  ok,
  badReq,
  forbidden,
  notFound,
  conflict,
  internal,
} from "../shared/response";
import { getCaller, parseJsonBody } from "../shared/auth";
import { parseProductInput } from "../shared/productInput";

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

    const sellerId = e.pathParameters?.sellerId;
    const productId = e.pathParameters?.productId;

    if (!sellerId || !productId) {
      return badReq("sellerId または productId が指定されていません");
    }

    if (sellerId !== caller.sub) {
      return forbidden("他人の商品は編集できません");
    }

    const body = parseJsonBody(e.body);
    if (!body.ok) {
      return badReq("JSON の形式が不正です");
    }

    const input = parseProductInput(body.value);
    if (!input.ok) {
      return badReq(input.message);
    }

    const expectedStock = body.value?.expectedStock;
    if (
      typeof expectedStock !== "number" ||
      !Number.isInteger(expectedStock) ||
      expectedStock < 0
    ) {
      return badReq("expectedStock（編集開始時の在庫数）を指定してください");
    }

    const { name, price, category, stock, imageKey, imageUrl } = input.value;

    const expressionAttributeValues: Record<string, any> = {
      ":name": name,
      ":price": price,
      ":category": category,
      ":stock": stock,
      ":updatedAt": new Date().toISOString(),
      ":expectedStock": expectedStock,
    };

    let updateExpression =
      "SET #name = :name, price = :price, category = :category, stock = :stock, updatedAt = :updatedAt";

    if (imageKey && imageUrl) {
      updateExpression += ", imageKey = :imageKey, imageUrl = :imageUrl";
      expressionAttributeValues[":imageKey"] = imageKey;
      expressionAttributeValues[":imageUrl"] = imageUrl;
    } else if (imageKey === null) {
      updateExpression += " REMOVE imageKey, imageUrl";
    }

    const result = await db.send(
      new UpdateCommand({
        TableName: PRODUCTS_TABLE,
        Key: {
          sellerId,
          productId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression:
          "attribute_exists(productId) AND stock = :expectedStock",
        ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        ReturnValues: "ALL_NEW",
      }),
    );

    return ok(result.Attributes);
  } catch (err: any) {
    console.error("updateProduct エラー:", err);
    if (err.name === "ConditionalCheckFailedException") {
      if (err.Item) {
        const raw = err.Item.stock;
        const currentStock = Number(
          raw && typeof raw === "object" ? raw.N : raw,
        );
        return conflict(
          `在庫数が他の操作（注文など）により ${currentStock} 点に変更されています。最新の在庫数を確認して再度保存してください`,
          { reason: "STOCK_CHANGED", currentStock },
        );
      }
      return notFound("指定された商品が見つかりません");
    }
    return internal();
  }
};
