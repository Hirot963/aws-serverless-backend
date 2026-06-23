# システム設計書 — EC マーケットプレイス

**プロジェクト名**: EC マーケットプレイス（サーバーレス実装課題）  
**作成日**: 2026-06-22  
**アーキテクチャ**: AWS サーバーレス  
**フロントエンド**: Vue 3 / React 18 / Angular 17（選択制）

## 0.ベース
 screen-design.htmlがシステムのベースデザインと機能のHTMLモックです。
 デザインは一部変更は可能ですが、機能が損なわれないように。

---

## 1. システム概要

Consumer（購入者）と Seller（出品者）の 2 つのロールを持つ EC マーケットプレイス。  
AWS のサーバーレスサービスを中心に構成し、フロントエンドは Vue / React / Angular の 3 フレームワークから選択可能。

### 主な機能

| 機能 | ロール | 概要 |
|------|--------|------|
| 商品一覧・詳細閲覧 | 全員 | カテゴリ絞り込み・ページネーション対応 |
| 商品登録・編集・削除 | Seller | 自分の商品のみ操作可能 |
| 商品画像アップロード | Seller | S3 Presigned URL 経由の直接アップロード |
| カート追加・削除 | Consumer | ユーザーごとのカート管理 |
| 注文確定 | Consumer | 在庫チェック + 原子的書き込み |
| 注文履歴確認 | Consumer | 自分の注文のみ |
| 受注一覧確認 | Seller | GSI による自分宛て注文の検索 |

---

## 2. アーキテクチャ概要

```
[フロントエンド]
Vue 3 / React 18 / Angular 17
AWS Amplify JS v6
        │
        │ signIn / signOut / fetchAuthSession
        ▼
[Amazon Cognito]
User Pool（consumer / seller グループ）
JWT トークン発行
        │
        │ Authorization: Bearer <JWT>
        ▼
[Amazon API Gateway]
REST API
Cognito Authorizer（JWT 自動検証）
Lambda Proxy 統合 / CORS 設定
        │
        │ event（Lambda Proxy 形式）
        ▼
[AWS Lambda × 12]
Node.js 24 / TypeScript / esbuild
        │
        ├──── CRUD ──────▶ [Amazon DynamoDB]
        │                   Products / Orders / Cart テーブル
        │
        └── Presigned URL ─▶ [Amazon S3]
                              商品画像ストレージ
                              CloudFront OAC 経由で配信
```

### サービス一覧

| サービス | 用途 |
|---------|------|
| Amazon Cognito | ユーザー認証・グループ管理・JWT 発行 |
| Amazon API Gateway | REST API エンドポイント公開・JWT 検証 |
| AWS Lambda | ビジネスロジック実行（12 関数） |
| Amazon DynamoDB | データ永続化（3 テーブル） |
| Amazon S3 | 商品画像ストレージ |
| Amazon CloudFront | CDN 配信（OAC 経由） |
| AWS Amplify JS v6 | フロントエンドから Cognito 認証 |
| AWS SDK v3 | Lambda から AWS サービス接続 |

---

## 3. 認証・認可フロー

### 3-1. 認証フロー（ログイン）

```
フロントエンド                    Cognito                  API Gateway / Lambda
     │                               │                           │
     │── signIn(username, password) ─▶│                           │
     │                               │── 認証処理                │
     │◀── JWT（ID Token）──────────── │                           │
     │                               │                           │
     │── API リクエスト                                           │
     │   Authorization: Bearer <JWT> ────────────────────────────▶│
     │                               │── JWT 署名・期限 検証      │
     │                               │   （Cognito Authorizer）   │
     │                        ✓ 有効 │───────────────────────────▶│
     │                               │                  Lambda 実行│
     │◀── レスポンス ─────────────────────────────────────────────│
```

### 3-2. ロール制御の仕組み

**API Gateway レイヤー（全エンドポイント共通）**  
- Cognito Authorizer が JWT の署名・有効期限を検証
- 無効トークン → `401 Unauthorized` を返す（Lambda 未実行）

**Lambda レイヤー（ロール別制御）**  
- `event.requestContext.authorizer.claims` から以下を取得：

```typescript
const sub = claims['sub'];                    // ユーザー ID
const groups = claims['cognito:groups'] ?? []; // ['consumer'] or ['seller']
```

| チェック種別 | 実装箇所 | 内容 |
|------------|---------|------|
| seller グループ確認 | 各 seller 専用 Lambda | `groups.includes('seller')` でなければ 403 |
| オーナーチェック | updateProduct / deleteProduct | JWT の `sub` と DynamoDB の `sellerId` を照合 |
| consumer グループ確認 | カート・注文系 Lambda | `groups.includes('consumer')` でなければ 403 |

### 3-3. Cognito User Pool 設定

| 設定項目 | 値 |
|---------|-----|
| ユーザープール名 | ec-marketplace-pool |
| グループ | `consumer`（購入者）、`seller`（出品者） |
| トークン有効期限 | ID Token: 1時間、Refresh Token: 30日 |
| パスワードポリシー | 最小8文字・大文字小文字数字記号含む |

---

## 4. API 設計

### 4-1. 共通仕様

| 項目 | 内容 |
|------|------|
| ベース URL | `https://{api-id}.execute-api.{region}.amazonaws.com/{stage}` |
| 認証方式 | Bearer Token（Cognito JWT ID Token） |
| レスポンス形式 | `application/json` |
| エラーレスポンス | `{ "message": "エラー内容" }` |
| CORS | フロントエンドオリジンを許可 |

> **注意**: 全エンドポイントに `Authorization: Bearer <JWT>` ヘッダーが必須。  
> `seller` タグのエンドポイントは Lambda 内でさらにグループチェックを実施。

### 4-2. エンドポイント一覧

#### Products

| メソッド | パス | Lambda 関数 | 権限 | 説明 |
|---------|------|------------|------|------|
| `GET` | `/products` | `getProducts` | 全員 | 商品一覧取得（カテゴリ・ページネーション対応） |
| `POST` | `/products` | `createProduct` | seller | 商品登録 |
| `GET` | `/products/upload-url` | `getUploadUrl` | seller | S3 Presigned URL 発行（画像アップロード用） |
| `GET` | `/products/{sellerId}/{productId}` | `getProduct` | 全員 | 商品詳細取得 |
| `PUT` | `/products/{sellerId}/{productId}` | `updateProduct` | seller（本人のみ） | 商品更新（sub でオーナーチェック） |
| `DELETE` | `/products/{sellerId}/{productId}` | `deleteProduct` | seller（本人のみ） | 商品削除 |

#### Cart

| メソッド | パス | Lambda 関数 | 権限 | 説明 |
|---------|------|------------|------|------|
| `GET` | `/cart` | `getCart` | consumer | カート取得（buyerId で絞り込み） |
| `POST` | `/cart` | `addToCart` | consumer | カートに商品追加 |
| `DELETE` | `/cart/{productId}` | `removeFromCart` | consumer | カートから商品削除 |

#### Orders

| メソッド | パス | Lambda 関数 | 権限 | 説明 |
|---------|------|------------|------|------|
| `GET` | `/orders` | `getOrders` | consumer | 注文履歴取得 |
| `POST` | `/orders` | `createOrder` | consumer | 注文確定（在庫チェック + TransactWrite） |
| `GET` | `/seller/orders` | `getSellerOrders` | seller | 受注一覧取得（GSI で自分の注文のみ） |

### 4-3. リクエスト・レスポンス仕様（主要エンドポイント）

#### `GET /products`

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `category` | string | 任意 | カテゴリ絞り込み |
| `limit` | number | 任意 | 取得件数（デフォルト: 20） |
| `lastKey` | string | 任意 | ページネーション用カーソル（Base64） |

**レスポンス**

```json
{
  "items": [
    {
      "sellerId": "uuid",
      "productId": "uuid",
      "name": "商品名",
      "price": 1000,
      "category": "electronics",
      "imageUrl": "https://cdn.example.com/image.jpg",
      "stock": 10,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "lastKey": "base64string"
}
```

#### `POST /products`

**リクエストボディ**

```json
{
  "name": "商品名",
  "price": 1000,
  "category": "electronics",
  "imageKey": "uploads/uuid.jpg",
  "stock": 10
}
```

#### `POST /orders`

**リクエストボディ**

```json
{
  "items": [
    { "sellerId": "uuid", "productId": "uuid", "quantity": 2 }
  ]
}
```

**処理フロー**  
1. DynamoDB から各商品の在庫を確認  
2. `TransactWrite` で以下を原子的に実行：
   - Products テーブルの `stock` を減算（`ConditionExpression: stock >= :qty`）
   - Orders テーブルに注文レコードを書き込み
   - Cart テーブルから購入済みアイテムを削除  
3. 在庫不足 → `ConditionalCheckFailed` で自動ロールバック → `409 Conflict` を返す

#### `GET /products/upload-url`

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `fileName` | string | 必須 | アップロードするファイル名 |
| `contentType` | string | 必須 | `image/jpeg` / `image/png` など |

**レスポンス**

```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/key?X-Amz-Signature=...",
  "imageKey": "uploads/uuid.jpg"
}
```

---

## 5. エラーコード一覧

| HTTP ステータス | 発生条件 | 対応 |
|---------------|---------|------|
| 400 Bad Request | リクエストボディ不正 | バリデーションエラー内容を返す |
| 401 Unauthorized | JWT なし・無効 | API Gateway が返す（Lambda 未実行） |
| 403 Forbidden | ロール不足・オーナー不一致 | Lambda がチェックして返す |
| 404 Not Found | 商品・注文が存在しない | DynamoDB 取得結果が空 |
| 409 Conflict | 在庫不足（注文時） | TransactWrite の ConditionalCheckFailed |
| 500 Internal Server Error | Lambda 例外 | CloudWatch Logs でスタックトレースを確認 |
