import { CLOUDFRONT_URL } from "./db";

export const PRODUCT_CATEGORIES = ["electronics", "fashion", "books", "food"];
export const MAX_NAME_LENGTH = 100;
export const MAX_PRICE = 9999999;
export const MAX_STOCK = 99999;

const IMAGE_KEY_PATTERN = /^uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png)$/;

export interface ProductInput {
  name: string;
  price: number;
  category: string;
  stock: number;
  imageKey?: string | null;
  imageUrl?: string | null;
}

export type ParseResult =
  | { ok: true; value: ProductInput }
  | { ok: false; message: string };

const buildImageUrl = (imageKey: string, requestedUrl: unknown) => {
  if (typeof requestedUrl !== "string") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(requestedUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash) {
    return null;
  }
  const allowedHost = CLOUDFRONT_URL?.startsWith("https://")
    ? new URL(CLOUDFRONT_URL).host
    : null;
  const hostOk = allowedHost
    ? parsed.host === allowedHost
    : parsed.host.endsWith(".cloudfront.net");
  if (!hostOk || parsed.pathname !== `/${imageKey}`) {
    return null;
  }
  return parsed.toString();
};

export const parseProductInput = (body: any): ParseResult => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "リクエストボディの形式が不正です" };
  }

  const { name, price, category, stock, imageKey, imageUrl } = body;

  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, message: "商品名は必須です" };
  }
  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `商品名は${MAX_NAME_LENGTH}文字以内で入力してください`,
    };
  }
  if (
    typeof price !== "number" ||
    !Number.isInteger(price) ||
    price < 1 ||
    price > MAX_PRICE
  ) {
    return {
      ok: false,
      message: `価格は1以上${MAX_PRICE.toLocaleString()}以下の整数で入力してください`,
    };
  }
  if (typeof category !== "string" || !PRODUCT_CATEGORIES.includes(category)) {
    return {
      ok: false,
      message: `カテゴリは ${PRODUCT_CATEGORIES.join(" / ")} のいずれかを指定してください`,
    };
  }
  if (
    typeof stock !== "number" ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    stock > MAX_STOCK
  ) {
    return {
      ok: false,
      message: `在庫数は0以上${MAX_STOCK.toLocaleString()}以下の整数で入力してください`,
    };
  }

  const value: ProductInput = {
    name: trimmedName,
    price,
    category,
    stock,
  };

  if (imageKey === null) {
    value.imageKey = null;
    value.imageUrl = null;
  } else if (imageKey !== undefined) {
    if (typeof imageKey !== "string" || !IMAGE_KEY_PATTERN.test(imageKey)) {
      return { ok: false, message: "画像キーの形式が不正です" };
    }
    const url = buildImageUrl(imageKey, imageUrl);
    if (!url) {
      return { ok: false, message: "画像URLの形式が不正です" };
    }
    value.imageKey = imageKey;
    value.imageUrl = url;
  }

  return { ok: true, value };
};
