 import { randomUUID } from 'crypto';                                                                                                                                
    import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';                                                                                           
    import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';                                                                                                       
    import { db, PRODUCTS_TABLE, ORDERS_TABLE } from '../shared/db';                                                                                                    
    import { created, badReq, forbidden, internal } from '../shared/response';                                                                                          
                                                                                                                                                                        
    export const handler = async (e: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {                                                                         
      try {                                                                                                                                                             
        // 1. 購入者 ID（Cognito sub）の取得                                                                                                                            
        const buyerId = e.requestContext.authorizer?.claims?.sub;                                                                                                       
        if (!buyerId) {                                                                                                                                                 
          return forbidden('Unauthorized: buyer ID not found');                                                                                                         
        }                                                                                                                                                               
                                                                                                                                                                        
        // 2. リクエストボディのパースと検証                                                                                                                            
        const body = e.body ? JSON.parse(e.body) : {};                                                                                                                  
        const items = body.items;                                                                                                                                       
                                                                                                                                                                        
        if (!Array.isArray(items) || items.length === 0) {                                                                                                              
          return badReq('items must be a non-empty array');                                                                                                             
        }                                                                                                                                                               
                                                                                                                                                                        
        for (const item of items) {                                                                                                                                     
          if (!item.sellerId || !item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {                                                           
            return badReq('Invalid item format. sellerId, productId, and positive quantity are required');                                                              
          }                                                                                                                                                             
        }                                                                                                                                                               
                                                                                                                                                                        
        // 3. 注文情報とトランザクション構築                                                                                                                            
        const orderId = randomUUID();                                                                                                                                   
        const createdAt = new Date().toISOString();                                                                                                                     
                                                                                                                                                                        
        const totalPrice = items.reduce(                                                                                                                                
          (sum, item) => sum + (Number(item.price) || 0) * item.quantity,                                                                                               
          0                                                                                                                                                             
        );                                                                                                                                                              
                                                                                                                                                                        
        const transactItems: any[] = [];                                                                                                                                
                                                                                                                                                                        
        // ① 各商品の在庫減算（stock >= quantity の条件付き）                                                                                                           
        for (const item of items) {                                                                                                                                     
          transactItems.push({                                                                                                                                          
            Update: {                                                                                                                                                   
              TableName: PRODUCTS_TABLE,                                                                                                                                
              Key: {                                                                                                                                                    
                sellerId: item.sellerId,                                                                                                                                
                productId: item.productId,                                                                                                                              
              },                                                                                                                                                        
              UpdateExpression: 'SET stock = stock - :qty',                                                                                                             
              ConditionExpression: 'stock >= :qty',                                                                                                                     
              ExpressionAttributeValues: {                                                                                                                              
                ':qty': item.quantity,                                                                                                                                  
              },                                                                                                                                                        
            },                                                                                                                                                          
          });                                                                                                                                                           
        }                                                                                                                                                               
                                                                                                                                                                        
        // ② 注文レコードの作成                                                                                                                                         
        transactItems.push({                                                                                                                                            
          Put: {                                                                                                                                                        
            TableName: ORDERS_TABLE,                                                                                                                                    
            Item: {                                                                                                                                                     
              buyerId,                                                                                                                                                  
              orderId,                                                                                                                                                  
              sellerId: items[0].sellerId,                                                                                                                              
              items: items.map((item) => ({                                                                                                                             
                sellerId: item.sellerId,                                                                                                                                
                productId: item.productId,                                                                                                                              
                name: item.name ?? '',                                                                                                                                  
                price: Number(item.price) || 0,                                                                                                                         
                quantity: item.quantity,                                                                                                                                
                subtotal: (Number(item.price) || 0) * item.quantity,                                                                                                    
              })),                                                                                                                                                      
              totalPrice,                                                                                                                                               
              status: 'confirmed',                                                                                                                                      
              createdAt,                                                                                                                                                
            },                                                                                                                                                          
          },                                                                                                                                                            
        });                                                                                                                                                             
                                                                                                                                                                        
        // 4. トランザクションの実行                                                                                                                                    
        await db.send(new TransactWriteCommand({ TransactItems: transactItems }));                                                                                      
                                                                                                                                                                        
        return created({                                                                                                                                                
          orderId,                                                                                                                                                      
          totalPrice,                                                                                                                                                   
          status: 'confirmed',                                                                                                                                          
          createdAt,                                                                                                                                                    
        });                                                                                                                                                             
      } catch (err: any) {                                                                                                                                              
        console.error(err);                                                                                                                                             
                                                                                                                                                                        
        if (                                                                                                                                                            
          err.name === 'TransactionCanceledException' ||                                                                                                                
          err.message?.includes('ConditionalCheckFailed')                                                                                                               
        ) {                                                                                                                                                             
          return {                                                                                                                                                      
            statusCode: 409,                                                                                                                                            
            headers: {                                                                                                                                                  
              'Access-Control-Allow-Origin': '*',                                                                                                                       
              'Access-Control-Allow-Headers': 'Content-Type,Authorization',                                                                                             
              'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',                                                                                            
              'Content-Type': 'application/json',                                                                                                                       
            },                                                                                                                                                          
            body: JSON.stringify({ message: '在庫が不足している商品があります' }),                                                                                      
          };                                                                                                                                                            
        }                                                                                                                                                               
                                                                                                                                                                        
        return internal();                                                                                                                                              
      }                                                                                                                                                                 
    };
