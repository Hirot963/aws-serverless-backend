import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';                                                                                  
    import { UpdateCommand } from '@aws-sdk/lib-dynamodb';                                                                                                     
    import { db, PRODUCTS_TABLE } from '../shared/db';                                                                                                         
    import { ok, badReq, forbidden, notFound, internal } from '../shared/response';                                                                            
                                                                                                                                                               
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
                                                                                                                                                               
        // 3. オーナーチェック（本人の商品のみ編集可能）                                                                                                       
        if (sellerId !== callerId) {                                                                                                                           
          return forbidden('他人の商品は編集できません');                                                                                                      
        }                                                                                                                                                      
                                                                                                                                                               
        // 4. リクエストボディのパースとバリデーション                                                                                                         
        if (!e.body) {                                                                                                                                         
          return badReq('リクエストボディが空です');                                                                                                           
        }                                                                                                                                                      
                                                                                                                                                               
        let body: any;                                                                                                                                         
        try {                                                                                                                                                  
          body = typeof e.body === 'string' ? JSON.parse(e.body) : e.body;                                                                                     
        } catch {                                                                                                                                              
          return badReq('JSON の形式が不正です');                                                                                                              
        }                                                                                                                                                      
                                                                                                                                                               
        const { name, price, category, stock, imageKey, imageUrl } = body;                                                                                     
                                                                                                                                                               
        if (!name || typeof name !== 'string' || name.trim().length === 0) {                                                                                   
          return badReq('商品名は必須です');                                                                                                                   
        }                                                                                                                                                      
        if (name.length > 100) {                                                                                                                               
          return badReq('商品名は100文字以内で入力してください');                                                                                              
        }                                                                                                                                                      
        if (typeof price !== 'number' || price < 1 || !Number.isInteger(price)) {                                                                              
          return badReq('価格は1以上の整数で入力してください');                                                                                                
        }                                                                                                                                                      
        if (!category || typeof category !== 'string') {                                                                                                       
          return badReq('カテゴリは必須です');                                                                                                                 
        }                                                                                                                                                      
        if (typeof stock !== 'number' || stock < 0 || !Number.isInteger(stock)) {                                                                              
          return badReq('在庫数は0以上の整数で入力してください');                                                                                              
        }                                                                                                                                                      
                                                                                                                                                               
        // 5. DynamoDB UpdateCommand の実行                                                                                                                    
        const updatedAt = new Date().toISOString();                                                                                                            
                                                                                                                                                               
        // ※ DynamoDB の予約語 "name" を回避するため ExpressionAttributeNames を使用                                                                           
        const expressionAttributeNames: Record<string, string> = {                                                                                             
          '#name': 'name',                                                                                                                                     
        };                                                                                                                                                     
        const expressionAttributeValues: Record<string, any> = {                                                                                               
          ':name': name.trim(),                                                                                                                                
          ':price': price,                                                                                                                                     
          ':category': category,                                                                                                                               
          ':stock': stock,                                                                                                                                     
          ':updatedAt': updatedAt,                                                                                                                             
        };                                                                                                                                                     
                                                                                                                                                               
        let updateExpression =                                                                                                                                 
          'SET #name = :name, price = :price, category = :category, stock = :stock, updatedAt = :updatedAt';                                                   
                                                                                                                                                               
        if (imageKey) {                                                                                                                                        
          updateExpression += ', imageKey = :imageKey';                                                                                                        
          expressionAttributeValues[':imageKey'] = imageKey;                                                                                                   
        }                                                                                                                                                      
        if (imageUrl) {
          updateExpression += ', imageUrl = :imageUrl';
          expressionAttributeValues[':imageUrl'] = imageUrl;
        }
  
        const result = await db.send(
          new UpdateCommand({
            TableName: PRODUCTS_TABLE,
            Key: {
              sellerId,
              productId,
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: 'attribute_exists(productId)', // 商品が存在する場合のみ更新
            ReturnValues: 'ALL_NEW',
          })
        );
  
        return ok(result.Attributes);
      } catch (err: any) {
        console.error('updateProduct エラー:', err);
        if (err.name === 'ConditionalCheckFailedException') {
          return notFound('指定された商品が見つかりません');
        }
        return internal();
      }
    };
