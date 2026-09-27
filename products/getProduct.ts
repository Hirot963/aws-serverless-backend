 import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';                                                                                           
    import { GetCommand } from '@aws-sdk/lib-dynamodb';                                                                                                                 
    import { db, PRODUCTS_TABLE } from '../shared/db';                                                                                                                  
    import { ok, badReq, notFound, internal } from '../shared/response';                                                                                                
                                                                                                                                                                        
    export const handler = async (e: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {                                                                         
      try {                                                                                                                                                             
        const sellerId = e.pathParameters?.sellerId;                                                                                                                    
        const productId = e.pathParameters?.productId;                                                                                                                  
                                                                                                                                                                        
        if (!sellerId || !productId) {                                                                                                                                  
          return badReq('sellerId and productId are required');                                                                                                         
        }                                                                                                                                                               
                                                                                                                                                                        
        const r = await db.send(                                                                                                                                        
          new GetCommand({                                                                                                                                              
            TableName: PRODUCTS_TABLE,                                                                                                                                  
            Key: {                                                                                                                                                      
              sellerId,                                                                                                                                                 
              productId,                                                                                                                                                
            },                                                                                                                                                          
          })                                                                                                                                                            
        );                                                                                                                                                              
                                                                                                                                                                        
        if (!r.Item) {                                                                                                                                                  
          return notFound('Product not found');                                                                                                                         
        }                                                                                                                                                               
                                                                                                                                                                        
        return ok(r.Item);                                                                                                                                              
      } catch (err) {                                                                                                                                                   
        console.error(err);                                                                                                                                             
        return internal();                                                                                                                                              
      }
    };
