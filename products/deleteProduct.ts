import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';                                                                                  
    import { DeleteCommand } from '@aws-sdk/lib-dynamodb';                                                                                                     
    import { db, PRODUCTS_TABLE } from '../shared/db';                                                                                                         
    import { ok, badReq, forbidden, internal } from '../shared/response';                                                                                      
                                                                                                                                                               
    export const handler = async (                                                                                                                             
      e: APIGatewayProxyEvent                                                                                                                                  
    ): Promise<APIGatewayProxyResult> => {                                                                                                                     
      try {                                                                                                                                                    
        // 1. 出品者 ID (Cognito sub) およびグループの検証                                                                                                     
        const claims = e.requestContext?.authorizer?.claims;                                                                                                   
        const callerId = claims?.sub;                                                                                                                          
        const groupsRaw = claims?.['cognito:groups'];                                                                                                          
        const groups = Array.isArray(groupsRaw)                                                                                                                
          ? groupsRaw                                                                                                                                          
          : typeof groupsRaw === 'string'                                                                                                                      
          ? [groupsRaw]                                                                                                                                        
          : [];                                                                                                                                                
                                                                                                                                                               
        if (!callerId) {                                                                                                                                       
          return forbidden('認証情報が見つかりません');                                                                                                        
        }                                                                                                                                                      
                                                                                                                                                               
        if (!groups.includes('seller')) {                                                                                                                      
          return forbidden('出品者権限が必要です');                                                                                                            
        }                                                                                                                                                      
                                                                                                                                                               
        // 2. パスパラメータの取得 (/products/{sellerId}/{productId})                                                                                          
        const sellerId = e.pathParameters?.sellerId;
        const productId = e.pathParameters?.productId;
  
        if (!sellerId || !productId) {
          return badReq('sellerId または productId が指定されていません');
        }
  
        // 3. オーナーチェック（本人の商品のみ削除可能）
        if (sellerId !== callerId) {
          return forbidden('他人の商品は削除できません');
        }
  
        // 4. DynamoDB から商品を削除
        await db.send(
          new DeleteCommand({
            TableName: PRODUCTS_TABLE,
            Key: {
              sellerId,
              productId,
            },
          })
        );
  
        return ok({ message: '商品を削除しました', productId });
      } catch (err) {
        console.error('deleteProduct エラー:', err);
        return internal();
      }
    };
