# myg - My Google Workspace CLI

Google Workspace（Spreadsheet, Docs, Gmail）のデータを CLI から取得するツールです。
GAS（Google Apps Script）を自分専用のプロキシとして使い、`curl` 経由でアクセスします。

## ユーザー向け（使う人）

### 必要なもの

- bash, curl, jq
- ブラウザ（初回認証用）

### セットアップ

1. リポジトリをクローン

```bash
git clone <repository-url>
cd my-google-command
```

2. `.env` を作成

```bash
cp .env.example .env
```

実装者から共有された `DEPLOY_ID` を `.env` に記入してください。

3. インストール

```bash
./bin/install
```

`~/.local/bin` に `myg` コマンドがインストールされます。
PATH が通っていない場合は、シェルの設定ファイルに以下を追加してください。

```bash
export PATH="$HOME/.local/bin:$PATH"
```

4. 認証

```bash
myg auth
```

ブラウザが開きます。初回は Google の承認ダイアログが表示されるので、すべて許可してください。
トークンが表示されたら「Copy Token」ボタンでコピーし、ターミナルに戻ってペーストしてください。

> トークンは約1時間で期限切れになります。切れたら再度 `myg auth` を実行してください。

### 使い方

```bash
# ヘルプ
myg help

# --- Spreadsheet ---
myg spreadsheets                                    # 一覧取得
myg spreadsheet id=<ID>                             # シート一覧
myg spreadsheet "id=<URL>"                          # URL でも OK
myg sheet id=<ID> "name=<SHEET_NAME>"               # シートデータ取得

# --- Docs ---
myg docs                                            # 一覧取得
myg doc id=<ID>                                     # ドキュメント内容取得
myg doc "id=<URL>"                                  # URL でも OK

# --- Gmail ---
myg mails                                           # 受信トレイ最新20件
myg mails "q=is:unread" max=5                       # 検索クエリで絞り込み
myg mails "q=from:someone@example.com"              # 送信者で検索
myg mail id=<MESSAGE_ID>                            # メール本文取得
```

Gmail の `q` パラメータは [Gmail の検索構文](https://support.google.com/mail/answer/7190) がそのまま使えます。

---

## 実装者向け（開発・デプロイする人）

### 必要なもの

- Node.js（mise で管理: `yarn 4.13.0`）
- devcontainer 環境推奨

### 初回セットアップ

```bash
# 依存インストール
yarn install

# Google アカウントでログイン
yarn signin

# GAS プロジェクトを作成（リモートに新規作成）
yarn setup

# .clasp.json が dist/ に生成されるのでルートに移動
mv dist/.clasp.json .clasp.json

# .env を作成
cp .env.example .env
```

### 開発フロー

```bash
# ビルド + GAS にプッシュ
yarn apply

# デプロイ（.env に DEPLOY_ID があれば既存デプロイを更新）
yarn deploy
```

初回デプロイ後、出力される DEPLOY_ID を `.env` に記入してください。
以降は `yarn deploy` で同じ URL のまま更新されます。

### スコープの承認

`appsscript.json` にスコープを追加した場合、GAS エディタで該当サービスを使う関数を一度手動実行して承認する必要があります。

```bash
yarn open  # GAS エディタを開く
```

エディタ上で対象の関数（`listMails` など）を選択して実行し、承認ダイアログを許可してください。

> 全スコープが揃った状態で最初からデプロイする場合は、この手順は不要です。
> 新しいユーザーはブラウザでの初回アクセス時に一括で承認されます。

### 環境変数（.env）

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `DEPLOY_ID` | GAS のデプロイ ID | （必須） |
| `GW_ACCESS` | Web App のアクセス範囲（`DOMAIN` / `MYSELF`） | `DOMAIN` |

### npm scripts

| コマンド | 説明 |
|----------|------|
| `yarn build` | TypeScript ビルド + appsscript.json 生成 |
| `yarn push` | GAS にプッシュ |
| `yarn apply` | ビルド + プッシュ |
| `yarn deploy` | デプロイ（既存 ID があれば更新） |
| `yarn open` | GAS エディタを開く |
| `yarn signin` | clasp ログイン |
| `yarn setup` | GAS プロジェクト新規作成 |

### ディレクトリ構成

```
├── bin/
│   ├── myg          # CLI コマンド（bash + curl + jq）
│   ├── build        # ビルドスクリプト
│   ├── deploy       # デプロイスクリプト
│   └── install      # ユーザー向けインストーラー
├── src/
│   ├── main.ts      # doGet エントリポイント（ルーティング）
│   ├── spreadsheet.ts
│   ├── docs.ts
│   ├── gmail.ts
│   └── utils.ts     # 共通ヘルパー（resolveId）
├── .env.example
└── package.json
```
