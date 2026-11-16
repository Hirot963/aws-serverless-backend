import { randomUUID } from "crypto";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db, PRODUCTS_TABLE, ORDERS_TABLE } from "../shared/db";
import {
  created,
  badReq,
  forbidden,
  notFound,
  conflict,
  internal,
} from "../shared/response";
import { getCaller, parseJsonBody } from "../shared/auth";
import { MAX_STOCK } from "../shared/productInput";

const MAX_ORDER_LINES = 40;

interface RequestedLine {
  sellerId: string;
  productId: string;
  quantity: number;
  expectedPrice?: number;
}

interface VerifiedLine {
  sellerId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

const parseLines = (
  rawItems: unknown,
): { ok: true; lines: RequestedLine[] } | { ok: false; message: string } => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, message: "items は1件以上の配列で指定してください" };
  }

  const merged = new Map<string, RequestedLine>();

  for (const raw of rawItems) {
    const sellerId = raw?.sellerId;
    const productId = raw?.productId;
    const quantity = raw?.quantity;
    const price = raw?.price;

    if (
      typeof sellerId !== "string" ||
      sellerId.length === 0 ||
      typeof productId !== "string" ||
      productId.length === 0
    ) {
      return {
        ok: false,
        message: "各商品に sellerId と productId を指定してください",
      };
    }
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_STOCK
    ) {
      return { ok: false, message: "数量は1以上の整数で指定してください" };
    }
    if (price !== undefined && (typeof price !== "number" || !Number.isFinite(price))) {
      return { ok: false, message: "価格の形式が不正です" };
    }

    const key = `${sellerId}#${productId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > MAX_STOCK) {
        return { ok: false, message: "数量が多すぎます" };
      }
      if (typeof price === "number") {
        existing.expectedPrice = price;
      }
    } else {
      merged.set(key, {
        sellerId,
        productId,
        quantity,
        expectedPrice: typeof price === "number" ? price : undefined,
      });
    }
  }

  if (merged.size > MAX_ORDER_LINES) {
    return {
      ok: false,
      message: `一度に注文できる商品は${MAX_ORDER_LINES}種類までです`,
    };
  }

  return { ok: true, lines: Array.from(merged.values()) };
};

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const caller = getCaller(e);
    const buyerId = caller.sub;
    if (!buyerId) {
      return forbidden("認証情報が見つかりません");
    }
    if (caller.isSeller) {
      return forbidden("出品者アカウントでは注文できません");
    }

    const body = parseJsonBody(e.body);
    if (!body.ok) {
      return badReq("JSON の形式が不正です");
    }

    const parsed = parseLines(body.value?.items);
    if (!parsed.ok) {
      return badReq(parsed.message);
    }

    const products = await Promise.all(
      parsed.lines.map((line) =>
        db.send(
          new GetCommand({
            TableName: PRODUCTS_TABLE,
            Key: { sellerId: line.sellerId, productId: line.productId },
          }),
        ),
      ),
    );

    const verified: VerifiedLine[] = [];
    const missing: string[] = [];
    const priceChanged: string[] = [];
    const outOfStock: string[] = [];

    parsed.lines.forEach((line, i) => {
      const product = products[i].Item;
      if (!product) {
        missing.push(line.productId);
        return;
      }
      const currentPrice = Number(product.price);
      if (
        line.expectedPrice !== undefined &&
        line.expectedPrice !== currentPrice
      ) {
        priceChanged.push(line.productId);
      }
      if (Number(product.stock) < line.quantity) {
        outOfStock.push(line.productId);
      }
      verified.push({
        sellerId: line.sellerId,
        productId: line.productId,
        name: String(product.name ?? ""),
        price: currentPrice,
        quantity: line.quantity,
      });
    });

    if (missing.length > 0) {
      return notFound("販売が終了した商品がカートに含まれています");
    }
    if (priceChanged.length > 0) {
      return conflict(
        "価格が変更された商品があります。最新の価格をご確認ください",
        { reason: "PRICE_CHANGED", productIds: priceChanged },
      );
    }
    if (outOfStock.length > 0) {
      return conflict("在庫が不足している商品があります", {
        reason: "OUT_OF_STOCK",
        productIds: outOfStock,
      });
    }

    const createdAt = new Date().toISOString();

    const linesBySeller = new Map<string, VerifiedLine[]>();
    for (const line of verified) {
      const list = linesBySeller.get(line.sellerId) ?? [];
      list.push(line);
      linesBySeller.set(line.sellerId, list);
    }

    const transactItems: any[] = verified.map((line) => ({
      Update: {
        TableName: PRODUCTS_TABLE,
        Key: { sellerId: line.sellerId, productId: line.productId },
        UpdateExpression: "SET stock = stock - :qty",
        ConditionExpression:
          "attribute_exists(productId) AND stock >= :qty AND price = :price",
        ExpressionAttributeValues: {
          ":qty": line.quantity,
          ":price": line.price,
        },
      },
    }));

    const orderIds: string[] = [];
    let totalPrice = 0;

    for (const [sellerId, sellerLines] of linesBySeller) {
      const orderId = randomUUID();
      orderIds.push(orderId);

      const orderItems = sellerLines.map((line) => ({
        sellerId: line.sellerId,
        productId: line.productId,
        name: line.name,
        price: line.price,
        quantity: line.quantity,
        subtotal: line.price * line.quantity,
      }));
      const sellerTotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
      totalPrice += sellerTotal;

      transactItems.push({
        Put: {
          TableName: ORDERS_TABLE,
          Item: {
            buyerId,
            orderId,
            sellerId,
            items: orderItems,
            totalPrice: sellerTotal,
            status: "confirmed",
            createdAt,
          },
        },
      });
    }

    await db.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return created({
      orderId: orderIds[0],
      orderIds,
      totalPrice,
      status: "confirmed",
      createdAt,
    });
  } catch (err: any) {
    console.error("createOrder エラー:", err);

    if (err?.name === "TransactionCanceledException") {
      return conflict(
        "在庫または価格が変更された商品があります。最新の内容をご確認ください",
        { reason: "CHANGED_DURING_ORDER" },
      );
    }

    return internal();
  }
};
