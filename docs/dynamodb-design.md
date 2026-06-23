# DynamoDB 設計書 — EC マーケットプレイス

---

## 概要

| テーブル名 | 用途 | GSI 数 |
|-----------|------|--------|
| Products | 商品データ管理 | 1 |
| Orders | 注文データ管理 | 1 |
| Cart | カートデータ管理 | 0 |

---

## 1. Products テーブル

### キー設計

| 項目 | 属性名 | 型 | 説明 |
|------|-------|----|------|
| パーティションキー（PK） | `sellerId` | String | 出品者の Cognito sub（UUID） |
| ソートキー（SK） | `productId` | String | 商品 ID（UUID、Lambda で生成） |

### 属性一覧

| 属性名 | 型 | 必須 | 説明 |
|-------|----|------|------|
| `sellerId` | String | ✓ | 出品者 ID（Cognito sub） |
| `productId` | String | ✓ | 商品 ID（UUID） |
| `name` | String | ✓ | 商品名 |
| `price` | Number | ✓ | 価格（円） |
| `category` | String | ✓ | カテゴリ（例: `electronics`, `fashion`） |
| `imageKey` | String | 任意 | S3 オブジェクトキー（例: `uploads/uuid.jpg`） |
| `imageUrl` | String | 任意 | CloudFront 経由の画像 URL |
| `stock` | Number | ✓ | 在庫数（0 以上の整数） |
| `createdAt` | String | ✓ | 作成日時（ISO 8601: `2024-01-01T00:00:00Z`） |
| `updatedAt` | String | 任意 | 更新日時（ISO 8601） |

### GSI: category-createdAt-index

カテゴリ別・新着順の商品一覧クエリに使用。

| 項目 | 属性名 | 型 |
|------|-------|----|
| パーティションキー | `category` | String |
| ソートキー | `createdAt` | String |

**ユースケース**

```
# カテゴリ "electronics" の商品を新着順で取得
KeyConditionExpression: category = :cat
ExpressionAttributeValues: { ":cat": "electronics" }
ScanIndexForward: false  # 降順（新しい順）
IndexName: category-createdAt-index
```

### アクセスパターン

| 操作 | 使用方法 | API |
|------|---------|-----|
| 全商品一覧取得 | GSI Scan（カテゴリ未指定時）| `GET /products` |
| カテゴリ別一覧取得 | GSI Query（category = :cat） | `GET /products?category=xxx` |
| 商品詳細取得 | GetItem（sellerId + productId） | `GET /products/{sellerId}/{productId}` |
| 商品登録 | PutItem | `POST /products` |
| 商品更新 | UpdateItem（sub でオーナーチェック後） | `PUT /products/{sellerId}/{productId}` |
| 商品削除 | DeleteItem（sub でオーナーチェック後） | `DELETE /products/{sellerId}/{productId}` |
| 在庫減算（注文時） | TransactWrite の Update（ConditionExpression 付き） | `POST /orders` 内部 |

### サンプルデータ

```json
{
  "sellerId": "8a7b6c5d-...",
  "productId": "1a2b3c4d-...",
  "name": "ワイヤレスイヤホン",
  "price": 4980,
  "category": "electronics",
  "imageKey": "uploads/1a2b3c4d.jpg",
  "imageUrl": "https://d1234.cloudfront.net/uploads/1a2b3c4d.jpg",
  "stock": 25,
  "createdAt": "2024-03-01T10:00:00Z",
  "updatedAt": "2024-03-05T14:30:00Z"
}
```

---

## 2. Orders テーブル

### キー設計

| 項目 | 属性名 | 型 | 説明 |
|------|-------|----|------|
| パーティションキー（PK） | `buyerId` | String | 購入者の Cognito sub（UUID） |
| ソートキー（SK） | `orderId` | String | 注文 ID（UUID、Lambda で生成） |

### 属性一覧

| 属性名 | 型 | 必須 | 説明 |
|-------|----|------|------|
| `buyerId` | String | ✓ | 購入者 ID（Cognito sub） |
| `orderId` | String | ✓ | 注文 ID（UUID） |
| `sellerId` | String | ✓ | 出品者 ID（GSI キー。複数出品者の注文は複数レコード） |
| `items` | List | ✓ | 購入商品リスト（下記参照） |
| `totalPrice` | Number | ✓ | 合計金額（円） |
| `status` | String | ✓ | 注文状態（`pending` / `confirmed` / `cancelled`） |
| `createdAt` | String | ✓ | 注文日時（ISO 8601） |

**items リスト構造**

```json
[
  {
    "sellerId": "uuid",
    "productId": "uuid",
    "name": "商品名",
    "price": 4980,
    "quantity": 2,
    "subtotal": 9960
  }
]
```

### GSI: sellerId-createdAt-index

出品者が自分宛ての注文（受注一覧）を検索するために使用。

| 項目 | 属性名 | 型 |
|------|-------|----|
| パーティションキー | `sellerId` | String |
| ソートキー | `createdAt` | String |

**ユースケース**

```
# 出品者 ID が "8a7b..." の受注を新着順で取得
KeyConditionExpression: sellerId = :sid
ExpressionAttributeValues: { ":sid": "8a7b6c5d-..." }
ScanIndexForward: false
IndexName: sellerId-createdAt-index
```

### アクセスパターン

| 操作 | 使用方法 | API |
|------|---------|-----|
| 注文履歴取得（consumer） | Query（buyerId = :bid） | `GET /orders` |
| 受注一覧取得（seller） | GSI Query（sellerId = :sid） | `GET /seller/orders` |
| 注文登録 | TransactWrite の Put | `POST /orders` 内部 |

### サンプルデータ

```json
{
  "buyerId": "2b3c4d5e-...",
  "orderId": "9z8y7x6w-...",
  "sellerId": "8a7b6c5d-...",
  "items": [
    {
      "sellerId": "8a7b6c5d-...",
      "productId": "1a2b3c4d-...",
      "name": "ワイヤレスイヤホン",
      "price": 4980,
      "quantity": 2,
      "subtotal": 9960
    }
  ],
  "totalPrice": 9960,
  "status": "confirmed",
  "createdAt": "2024-03-10T15:00:00Z"
}
```

---

## 3. Cart テーブル

### キー設計

| 項目 | 属性名 | 型 | 説明 |
|------|-------|----|------|
| パーティションキー（PK） | `buyerId` | String | 購入者の Cognito sub（UUID） |
| ソートキー（SK） | `productId` | String | 商品 ID |

> 1 ユーザー × N 商品のシンプルな複合キー設計。GSI は不要。

### 属性一覧

| 属性名 | 型 | 必須 | 説明 |
|-------|----|------|------|
| `buyerId` | String | ✓ | 購入者 ID（Cognito sub） |
| `productId` | String | ✓ | 商品 ID |
| `sellerId` | String | ✓ | 出品者 ID（注文確定時に使用） |
| `quantity` | Number | ✓ | 数量（1 以上） |
| `addedAt` | String | ✓ | カートに追加した日時（ISO 8601） |

### アクセスパターン

| 操作 | 使用方法 | API |
|------|---------|-----|
| カート取得 | Query（buyerId = :bid） | `GET /cart` |
| カートに追加 | PutItem（既存なら上書き） | `POST /cart` |
| カートから削除 | DeleteItem（buyerId + productId） | `DELETE /cart/{productId}` |
| 注文確定時に削除 | TransactWrite の Delete（複数アイテム） | `POST /orders` 内部 |

### サンプルデータ

```json
{
  "buyerId": "2b3c4d5e-...",
  "productId": "1a2b3c4d-...",
  "sellerId": "8a7b6c5d-...",
  "quantity": 2,
  "addedAt": "2024-03-09T12:00:00Z"
}
```

---

