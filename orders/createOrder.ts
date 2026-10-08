import { randomUUID } from "crypto";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { db, PRODUCTS_TABLE, ORDERS_TABLE } from "../shared/db";
import { created, badReq, forbidden, internal } from "../shared/response";

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const buyerId = e.requestContext.authorizer?.claims?.sub;
    if (!buyerId) {
      return forbidden("Unauthorized: buyer ID not found");
    }

    const body = e.body ? JSON.parse(e.body) : {};
    const items = body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return badReq("items must be a non-empty array");
    }

    for (const item of items) {
      if (
        !item.sellerId ||
        !item.productId ||
        typeof item.quantity !== "number" ||
        item.quantity <= 0
      ) {
        return badReq(
          "Invalid item format. sellerId, productId, and positive quantity are required",
        );
      }
    }

    const createdAt = new Date().toISOString();

    const totalPrice = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
      0,
    );

    // 出品者ごとに商品をグループ化
    const itemsBySeller: Record<string, typeof items> = {};
    for (const item of items) {
      if (!itemsBySeller[item.sellerId]) {
        itemsBySeller[item.sellerId] = [];
      }
      itemsBySeller[item.sellerId].push(item);
    }

    const transactItems: any[] = [];

    for (const item of items) {
      transactItems.push({
        Update: {
          TableName: PRODUCTS_TABLE,
          Key: {
            sellerId: item.sellerId,
            productId: item.productId,
          },
          UpdateExpression: "SET stock = stock - :qty",
          ConditionExpression: "stock >= :qty",
          ExpressionAttributeValues: {
            ":qty": item.quantity,
          },
        },
      });
    }

    const createdOrderIds: string[] = [];
    for (const [sellerId, sellerItems] of Object.entries(itemsBySeller)) {
      const sellerOrderId = randomUUID();
      createdOrderIds.push(sellerOrderId);

      const sellerTotalPrice = sellerItems.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * item.quantity,
        0,
      );

      transactItems.push({
        Put: {
          TableName: ORDERS_TABLE,
          Item: {
            buyerId,
            orderId: sellerOrderId,
            sellerId,
            items: sellerItems.map((item) => ({
              sellerId: item.sellerId,
              productId: item.productId,
              name: item.name ?? "",
              price: Number(item.price) || 0,
              quantity: item.quantity,
              subtotal: (Number(item.price) || 0) * item.quantity,
            })),
            totalPrice: sellerTotalPrice,
            status: "confirmed",
            createdAt,
          },
        },
      });
    }

    await db.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return created({
      orderId: createdOrderIds[0],
      orderIds: createdOrderIds,
      totalPrice,
      status: "confirmed",
      createdAt,
    });
  } catch (err: any) {
    console.error(err);

    if (
      err.name === "TransactionCanceledException" ||
      err.message?.includes("ConditionalCheckFailed")
    ) {
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "在庫が不足している商品があります" }),
      };
    }

    return internal();
  }
};
