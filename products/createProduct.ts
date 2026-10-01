import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";                                                                                  
    import { PutCommand } from "@aws-sdk/lib-dynamodb";                                                                                                        
    import { randomUUID } from "crypto";                                                                                                                       
    import { db, PRODUCTS_TABLE } from "../shared/db";                                                                                                         
    import { created, badReq, forbidden, internal } from "../shared/response";                                                                                 
                                                                                                                                                               
    export const handler = async (                                                                                                                             
      e: APIGatewayProxyEvent                                                                                                                                  
    ): Promise<APIGatewayProxyResult> => {                                                                                                                     
      try {                                                                                                                                                    
        // 1. 出品者 ID (Cognito sub) およびグループの検証                                                                                                     
        const claims = e.requestContext.authorizer?.claims;                                                                                                    
        const sellerId = claims?.sub;                                                                                                                          
        const groupsRaw = claims?.["cognito:groups"];                                                                                                          
        const groups = Array.isArray(groupsRaw)                                                                                                                
          ? groupsRaw                                                                                                                                          
          : typeof groupsRaw === "string"                                                                                                                      
          ? [groupsRaw]                                                                                                                                        
          : [];                                                                                                                                                
                                                                                                                                                               
        if (!sellerId) {                                                                                                                                       
          return forbidden("認証情報が見つかりません");                                                                                                        
        }                                                                                                                                                      
                                                                                                                                                               
        if (!groups.includes("seller")) {                                                                                                                      
          return forbidden("出品者権限が必要です");                                                                                                            
        }                                                                                                                                                      
                                                                                                                                                               
        // 2. リクエストボディのパースとバリデーション                                                                                                         
        if (!e.body) {                                                                                                                                         
          return badReq("リクエストボディが空です");                                                                                                           
        }                                                                                                                                                      
                                                                                                                                                               
        let body: any;                                                                                                                                         
        try {                                                                                                                                                  
          body = JSON.parse(e.body);                                                                                                                           
        } catch {                                                                                                                                              
          return badReq("JSON の形式が不正です");                                                                                                              
        }                                                                                                                                                      
                                                                                                                                                               
        const { name, price, category, stock, imageKey, imageUrl } = body;                                                                                     
                                                                                                                                                               
        // バリデーション（設計書 S08 準拠）                                                                                                                   
        if (!name || typeof name !== "string" || name.trim().length === 0) {                                                                                   
          return badReq("商品名は必須です");                                                                                                                   
        }                                                                                                                                                      
        if (name.length > 100) {                                                                                                                               
          return badReq("商品名は100文字以内で入力してください");                                                                                              
        }                                                                                                                                                      
        if (typeof price !== "number" || price < 1 || !Number.isInteger(price)) {                                                                              
          return badReq("価格は1以上の整数で入力してください");                                                                                                
        }                                                                                                                                                      
        if (!category || typeof category !== "string") {                                                                                                       
          return badReq("カテゴリは必須です");                                                                                                                 
        }                                                                                                                                                      
        if (typeof stock !== "number" || stock < 0 || !Number.isInteger(stock)) {                                                                              
          return badReq("在庫数は0以上の整数で入力してください");                                                                                              
        }                                                                                                                                                      
                                                                                                                                                               
        // 3. 商品データの組み立て（PK: sellerId, SK: productId）                                                                                              
        const productId = randomUUID();                                                                                                                        
        const createdAt = new Date().toISOString();                                                                                                            
                                                                                                                                                               
        const item: Record<string, any> = {                                                                                                                    
          sellerId,                                                                                                                                            
          productId,                                                                                                                                           
          name: name.trim(),                                                                                                                                   
          price,                                                                                                                                               
          category,                                                                                                                                            
          stock,                                                                                                                                               
          createdAt,                                                                                                                                           
        };                                                                                                                                                     
                                                                                                                                                               
        if (imageKey) item.imageKey = imageKey;                                                                                                                
        if (imageUrl) item.imageUrl = imageUrl;                                                                                                                
                                                                                                                                                               
        // 4. DynamoDB Products テーブルに保存                                                                                                                 
        await db.send(                                                                                                                                         
          new PutCommand({                                                                                                                                     
            TableName: PRODUCTS_TABLE,                                                                                                                         
            Item: item,                                                                                                                                        
          })                                                                                                                                                   
        );                                                                                                                                                     
                                                                                                                                                               
        return created(item);                                                                                                                                  
      } catch (err: any) {                                                                                                                                     
        console.error("createProduct エラー:", err);                                                                                                           
        return internal();                                                                                                                                     
      }                                                                                                                                                        
    };
