import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { db, PRODUCTS_TABLE } from '../shared/db';
import { ok, badReq, forbidden, notFound, internal } from '../shared/response';
import { getCaller } from '../shared/auth';

export const handler = async (
  e: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const caller = getCaller(e);

    if (!caller.sub) {
      return forbidden('認証情報が見つかりません');
    }

    if (!caller.isSeller) {
      return forbidden('出品者権限が必要です');
    }

    const sellerId = e.pathParameters?.sellerId;
    const productId = e.pathParameters?.productId;

    if (!sellerId || !productId) {
      return badReq('sellerId または productId が指定されていません');
    }

    if (sellerId !== caller.sub) {
      return forbidden('他人の商品は削除できません');
    }

    await db.send(
      new DeleteCommand({
        TableName: PRODUCTS_TABLE,
        Key: {
          sellerId,
          productId,
        },
        ConditionExpression: 'attribute_exists(productId)',
      })
    );

    return ok({ message: '商品を削除しました', productId });
  } catch (err: any) {
    console.error('deleteProduct エラー:', err);
    if (err?.name === 'ConditionalCheckFailedException') {
      return notFound('指定された商品が見つかりません');
    }
    return internal();
  }
};
