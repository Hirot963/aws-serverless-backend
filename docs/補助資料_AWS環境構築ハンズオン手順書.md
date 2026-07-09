# 補助資料① — AWS 環境構築 ハンズオン手順書

EC マーケットプレイス開発課題

この手順書では AWS マネジメントコンソールを操作して EC サイトに必要なインフラをセットアップする手順を説明します。コマンドラインよりもコンソールの GUI 操作を中心に説明します。

この手順書はAWSの東京リージョン（ap-northeast-1）になっていますが、
使用するリージョンにより値を変更してください。

2026年のフロント課題実施でのリージョンは**us-east-1（バージニア北部）**　です

---

## 1. IAM ユーザーの作成(個人アカウントを使う場合のみ実施、会社発行のアカウントの場合は不要)

AWS のルートアカウント（登録したメールアドレスのアカウント）は強力すぎるため、開発には専用の IAM ユーザーを使います。

| 手順 | 内容 |
|------|------|
| 1 | AWS マネジメントコンソールにルートアカウントでログインする |
| 2 | 「IAM」を検索して開く → 「ユーザー」→「ユーザーを作成」 |
| 3 | ユーザー名を入力（例: ec-dev）→「次へ」 |
| 4 | 「ポリシーを直接アタッチする」を選択し、AmazonCognitoPowerUser / AmazonDynamoDBFullAccess / AWSLambda_FullAccess / AmazonAPIGatewayAdministrator / AmazonS3FullAccess / CloudFrontFullAccess にチェックを入れる |
| 5 | 「ユーザーの作成」→ 作成後「アクセスキーを作成」→「CLI」を選択 |
| 6 | アクセスキー ID とシークレットアクセスキーをメモ（または CSV ダウンロード）する |

> ⚠️ **アクセスキーの注意点**
>
> シークレットアクセスキーは作成時の 1 回しか表示されません。画面を閉じると二度と確認できないので、必ずその場でメモしてください。
>
> もし閉じてしまった場合はそのキーを削除して新しく作り直してください。
>
> アクセスキーは絶対に GitHub にコミットしないこと。`.env` ファイルや `.gitignore` を確認してください。

### 1-1. AWS CLI のインストール（不要）

AWS CLI は「ターミナルから AWS を操作するツール」です。コンソール（ブラウザ）でも同じ操作ができるため、CLI は必須ではありません。慣れてきたら使ってみましょう。

> 💡 **Windows の場合**
>
> 1. https://awscli.amazonaws.com/AWSCLIV2.msi をダウンロードして実行
> 2. PowerShell を新しく開いて `aws --version` と入力し、バージョンが表示されれば成功
> 3. `aws configure` を実行してアクセスキー・シークレットキー・リージョン（ap-northeast-1）を入力

> 💡 **Mac の場合**
>
> ターミナルで `brew install awscli` を実行するか、公式サイトの PKG ファイルをダウンロードして実行

---

## 2. Amazon Cognito の設定

### 2-1. ユーザープールの作成

> 🆕 **新しい Cognito UI について（2024年以降）**
>
> AWS コンソールの Cognito UI が更新されました。以下の手順は新しい UI に対応しています。
>
> SPA（シングルページアプリケーション）を選択すると、パスワードポリシー・MFA・クライアントシークレットなしが自動的に設定されます。

| 手順 | 内容 |
|------|------|
| 1 | AWS コンソールで「Cognito」を開く → 「ユーザーディレクトリを作成する」または「ユーザープールを作成」をクリック |
| 2 | アプリケーションタイプ: 「シングルページアプリケーション（SPA）」を選択 |
| 3 | アプリケーション名を入力（例: ec-frontend） |
| 4 | サインイン識別子: 「メールアドレス」にチェック |
| 5 | 自己登録を有効化: チェックが入っていることを確認 |
| 6 | サインアップのための必須属性: 何も追加しなくて OK（メールは自動的に必須） |
| 7 | リターン URL: 何も入力せずに「ユーザーディレクトリを作成する」をクリック |
| 8 | 作成後、「ユーザープール ID」と「クライアント ID」をメモする（`.env` に設定する） |

> 💡 **ユーザープール ID とクライアント ID の確認場所**
>
> Cognito → ユーザープール → 作成したプールをクリック
>
> - ユーザープール ID: 画面上部に表示（例: `ap-northeast-1_XXXXXXXXX`）
> - クライアント ID: 「アプリケーションクライアント」タブ → アプリ名をクリック

### 2-2. グループの作成

| 手順 | 内容 |
|------|------|
| 1 | 作成したユーザープール → 「グループ」タブ → 「グループを作成」 |
| 2 | グループ名「consumer」を作成する |
| 3 | 同様に「seller」グループも作成する |

> 💡 **ユーザーをグループに追加するには**
>
> サインアップ後、コンソールの「ユーザー」タブでユーザーを選択し、「グループに追加」から `consumer` または `seller` を選択します。

---

## 3. Amazon DynamoDB テーブルの作成

> 💡 **DynamoDB の考え方**
>
> PK（Partition Key）と SK（Sort Key）だけ決めれば OK です。
>
> その他の属性（name, price など）はアイテムを保存するときに自由に追加できます。

### 3-1. Products テーブル

| 手順 | 内容 |
|------|------|
| 1 | DynamoDB → 「テーブルを作成」 |
| 2 | テーブル名: `Products`　パーティションキー: `sellerId`（文字列）　ソートキー: `productId`（文字列） |
| 3 | 「テーブルを作成」をクリック |
| 4 | 作成後、テーブルを開く → 「インデックス」タブ → 「グローバルセカンダリイインデックス(GSI)を作成」 |
| 5 | PK: `category`（文字列）、SK: `createdAt`（文字列）、インデックス名: `category-createdAt-index` |

### 3-2. Orders テーブル

- テーブル名: `Orders`　PK: `buyerId`（文字列）　SK: `orderId`（文字列）
- GSI を追加: PK: `sellerId`、SK: `createdAt`、インデックス名: `seller-order-index`

### 3-3. Cart テーブル

- テーブル名: `Cart`　PK: `buyerId`（文字列）　SK: `productId`（文字列）

### 3-4. テストデータの追加（動作確認用）

テーブルを作成しただけではデータが空なので、フロントエンドと接続できているか確認するためにテストデータを 1 件追加しましょう。

| 手順 | 内容 |
|------|------|
| 1 | DynamoDB → テーブル → Products → 「項目を探索」タブ |
| 2 | 「項目を作成」ボタンをクリック |
| 3 | 以下の属性を入力して「項目を作成」をクリック |

| 属性名 | 型 | 値 |
|--------|----|----|
| sellerId | 文字列 | seller001 |
| productId | 文字列 | product001 |
| name | 文字列 | テスト商品 |
| price | 数値 | 1000 |
| category | 文字列 | 食品 |
| stock | 数値 | 10 |
| description | 文字列 | テスト用の商品です |
| createdAt | 文字列 | 2024-01-01T00:00:00Z |

**フロントエンドを起動後にブラウザで確認して「テスト商品」が表示されれば接続成功です。**

---

## 4. AWS Lambda 関数の作成

### 4-1. 関数の作成手順

| 手順 | 内容 |
|------|------|
| 1 | Lambda → 「関数を作成」→「一から作成」 |
| 2 | 関数名を入力（例: `getProducts`）　ランタイム: Node.js 24.x |
| : | 会社アカウントの場合は「その他の設定」から「カスタム実行ロール」→「aws-serverless-vue-lambda-role」を選択 |
| 3 | 「関数を作成」をクリック |
| 4 | コードエディタに JavaScript コードを貼り付ける（後述） |
| 5 | 「Deploy」ボタンをクリックして保存 |
| 6 | 「設定」→「環境変数」→「編集」で `PRODUCTS_TABLE = Products` を追加 |
| : | 個人アカウントの場合は「設定」→「アクセス権限」→ ロール名リンクをクリック（IAM が開く）→「許可を追加」→「ポリシーをアタッチ」→「AmazonDynamoDBFullAccess」を追加 |

> ⚠️ **Lambda は JavaScript のみ対応**
>
> Lambda のインラインエディタは TypeScript を直接実行できません。
>
> ファイル名は `index.js` にしてください（`index.mjs` にすると `require` が使えなくなります）。
>
> スターターキットの TypeScript コードを使う場合は、`npm run build` でコンパイルした `.js` ファイルをアップロードしてください。

### 4-2. getProducts のコード（コピー&ペースト用）

以下を Lambda のコードエディタに貼り付けて「Deploy」を押してください。

```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(client);
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

const ok = (b) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
const internal = (m = 'Internal server error') => ({ statusCode: 500, headers: CORS, body: JSON.stringify({ message: m }) });

exports.handler = async (e) => {
  try {
    const category = e.queryStringParameters?.category;
    const limit = Number(e.queryStringParameters?.limit ?? 20);

    if (category) {
      const r = await db.send(new QueryCommand({
        TableName: PRODUCTS_TABLE,
        IndexName: 'category-createdAt-index',
        KeyConditionExpression: 'category = :cat',
        ExpressionAttributeValues: { ':cat': category },
        Limit: limit,
        ScanIndexForward: false,
      }));
      return ok({ items: r.Items ?? [], count: r.Count });
    }

    const r = await db.send(new ScanCommand({ TableName: PRODUCTS_TABLE, Limit: limit }));
    return ok({ items: r.Items ?? [], count: r.Count });
  } catch (err) {
    console.error(err);
    return internal();
  }
};
```

---

## 5. API Gateway の設定

### 5-1. REST API の作成

| 手順 | 内容 |
|------|------|
| 1 | API Gateway → 「API を作成」→「REST API」→「構築」 |
| 2 | API 名: `ec-api` → 「API を作成」 |
| 3 | 「リソースを作成」で `/products` を追加 |
| 4 | `/products` を選択 → 「メソッドを作成」→ GET を選択 |
| 5 | 統合タイプ: Lambda 関数 / Lambda プロキシ統合: ON（チェックを入れる）/ Lambda 関数名を選択 → 「メソッドを作成」 |
| 6 | 「API をデプロイ」→ 新しいステージ名「prod」→「デプロイ」 |
| 7 | 表示された URL（例: `https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod`）を `.env` の `VITE_API_ENDPOINT` に設定 |

> ⚠️ **Lambda プロキシ統合は必ず ON にする**
>
> Lambda プロキシ統合が OFF だと、Lambda が返した CORS ヘッダーが API Gateway に渡されず、ブラウザで CORS エラーが発生します。
>
> メソッドの「統合リクエスト」→「編集」→「Lambda プロキシ統合」をチェックして保存してください。

### 5-2. CORS の設定

| 手順 | 内容 |
|------|------|
| 1 | `/products` リソースを選択 → 「CORS を有効にする」をクリック |
| 2 | Access-Control-Allow-Origin: `*`　Access-Control-Allow-Headers: `Content-Type,Authorization`　メソッド: GET, POST, OPTIONS にチェック (Postは今後、関数を追加すると出てきます、今はないです) |
| 3 | 「保存」をクリック |
| 4 | 【重要】「API をデプロイ」→ ステージ: prod → 「デプロイ」を必ず実行する |

> ⚠️ **CORS エラーが出たときのチェックリスト**
>
> 1. Lambda プロキシ統合が ON になっているか
> 2. API Gateway で CORS を有効化したか
> 3. CORS 設定後に「API をデプロイ」を再実行したか（これを忘れがち）
> 4. ブラウザのアドレスバーに API の URL を直接入力して JSON が返ってくるか確認する

### 5-3. Cognito Authorizer の設定

| 手順 | 内容 |
|------|------|
| 1 | API Gateway → 作成した API → 「オーソライザー」→「新しいオーソライザーを作成」 |
| 2 | タイプ: Cognito　Cognito ユーザープール: 作成したプールを選択　トークンのソース: `Authorization` |
| 3 | 認証が必要なメソッドの「メソッドリクエスト」→「認証」でこのオーソライザーを選択する |

---

## 6. S3 + CloudFront の設定

### 6-1. フロントエンド用 S3 バケット

| 手順 | 内容 |
|------|------|
| 1 | S3 → 「バケットを作成」→ バケット名を入力（例: `ec-frontend-yourname`） |
| 2 | 「パブリックアクセスをすべてブロック」のチェックを外す |
| 3 | バケットポリシーでパブリック読み取りを許可する |
| 4 | `vite build` 後、`dist/` フォルダの中身をバケットにアップロードする |

### 6-2. 商品画像用 S3 バケット

| 手順 | 内容 |
|------|------|
| 1 | 別のバケットを作成（例: `ec-product-images-yourname`） |
| 2 | CloudFront ディストリビューションを作成し、このバケットを配信元に設定する |
| 3 | CloudFront の URL（例: `https://xxx.cloudfront.net`）を `.env` の `VITE_CLOUDFRONT_URL` に設定する |

---

## 7. フロントエンドの起動と動作確認

| 手順 | 内容 |
|------|------|
| 1 | `frontend` フォルダで `.env.example` をコピーして `.env` を作成する（Windows: `copy .env.example .env`） |
| 2 | `.env` に Cognito のユーザープール ID・クライアント ID・API Gateway の URL を入力して保存 |
| 3 | `npm install` を実行 |
| 4 | `npm run dev` を実行 → `http://localhost:5173` で起動 |
| 5 | ブラウザで `http://localhost:5173` を開き、商品一覧画面が表示されることを確認 |
| 6 | 3-4 で追加したテストデータ「テスト商品」が表示されれば接続成功 |

> 💡 **`.env` の書き方**
>
> ```
> VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
> VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
> VITE_API_ENDPOINT=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
> ```

---

