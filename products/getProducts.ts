import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { PRODUCTS_TABLE } from "../shared/db";
import { ok, badReq, internal } from "../shared/response";
import { queryAll, scanAll } from "../shared/paginate";

const byCreatedAtDesc = (a: Record<string, any>, b: Record<string, any>) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const handler = async (
  e: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const category = e.queryStringParameters?.category;
    const limitParam = e.queryStringParameters?.limit;
    let limit: number | undefined;

    if (limitParam !== undefined) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit < 1) {
        return badReq("limit は1以上の整数で指定してください");
      }
    }

    const all = category
      ? await queryAll({
          TableName: PRODUCTS_TABLE,
          IndexName: "category-createdAt-index",
          KeyConditionExpression: "category = :cat",
          ExpressionAttributeValues: { ":cat": category },
          ScanIndexForward: false,
        })
      : await scanAll({ TableName: PRODUCTS_TABLE });

    const sorted = all.sort(byCreatedAtDesc);
    const items = limit ? sorted.slice(0, limit) : sorted;
    return ok({ items, count: items.length });
  } catch (err) {
    console.error(err);
    return internal();
  }
};
