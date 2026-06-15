import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { db, PRODUCTS_TABLE } from '../shared/db';
import { ok, internal } from '../shared/response';

export const handler = async (e: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const category = e.queryStringParameters?.category;
    const limit = Number(e.queryStringParameters?.limit ?? 20);

    if (category) {
      const r = await db.send(new QueryCommand({
        TableName: PRODUCTS_TABLE,
        IndexName: 'category-createdAt-index',
        KeyConditionExpression: 'category = :cat',
        ExpressionAttributeValues: { ':cat': category },
        Limit: limit,
        ScanIndexForward: false,
      }));
      return ok({ items: r.Items ?? [], count: r.Count });
    }

    const r = await db.send(new ScanCommand({ TableName: PRODUCTS_TABLE, Limit: limit }));
    return ok({ items: r.Items ?? [], count: r.Count });
  } catch (err) {
    console.error(err);
    return internal();
  }
};
