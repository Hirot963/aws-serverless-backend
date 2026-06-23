# EC マーケットプレイス — バックエンド

AWS Lambda + API Gateway + DynamoDB + Cognito + S3 + CloudFront のサーバーレスバックエンド実装です。

このプロジェクトはフロントエンド（Vue,React,Angular）でそれぞれリポジトリがあるので、招待されていない場合は確認をしてください。

- 個人課題になります。
- バックエンド、フロントエンドの開発トータルで目安は3週間(15営業日)です（レビューも込み）
- リポジトリをCloneしてもらい各自課題を実施してもらいます、その後リポジトリのコードを確認します（育成部）

- Dynamoの設計書をdocsに入れました
- API設計、画面モックをdocsに入れました

## 技術スタック

| サービス | 用途 |
|---------|------|
| AWS Lambda (Node.js 24) | API ロジック × 11 関数 |
| Amazon API Gateway (REST) | エンドポイント管理・Cognito 認証 |
| Amazon DynamoDB | 商品・注文・カートデータ |
| Amazon Cognito | ユーザー認証・ロール管理（consumer / seller） |
| Amazon S3 | 商品画像ストレージ |
| Amazon CloudFront | CDN 配信 |

## API エンドポイント

| メソッド | パス | 機能 |
|---------|------|------|
| GET | /products | 商品一覧取得 |
| POST | /products | 商品登録 |
| GET | /products/upload-url | S3 署名付き URL 取得 |
| GET | /products/{sellerId}/{productId} | 商品詳細取得 |
| PUT | /products/{sellerId}/{productId} | 商品更新 |
| DELETE | /products/{sellerId}/{productId} | 商品削除 |
| GET | /cart | カート取得 |
| POST | /cart | カートに追加 |
| DELETE | /cart/{productId} | カートから削除 |
| GET | /orders | 注文一覧取得（consumer） |
| POST | /orders | 注文作成（在庫 TransactWrite） |
| GET | /seller/orders | 受注一覧取得（seller） |
