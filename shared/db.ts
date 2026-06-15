import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE!;
export const ORDERS_TABLE   = process.env.ORDERS_TABLE!;
export const CART_TABLE     = process.env.CART_TABLE!;
export const IMAGE_BUCKET   = process.env.IMAGE_BUCKET!;
export const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL!;
