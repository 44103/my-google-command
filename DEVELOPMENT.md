# 開発者向け（開発・デプロイする人）

## 必要なもの

- Node.js（mise で管理: `yarn 4.13.0`）
- devcontainer 環境推奨

## 初回セットアップ

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

## 開発フロー

```bash
# ビルド + GAS にプッシュ
yarn apply

# デプロイ（.env に DEPLOY_ID があれば既存デプロイを更新）
yarn deploy
```

初回デプロイ後、出力される DEPLOY_ID を `.env` に記入してください。
以降は `yarn deploy` で同じ URL のまま更新されます。

## スコープの承認

`appsscript.json` にスコープを追加した場合、GAS エディタで該当サービスを使う関数を一度手動実行して承認する必要があります。

```bash
yarn open  # GAS エディタを開く
```

エディタ上で対象の関数（`listMails` など）を選択して実行し、承認ダイアログを許可してください。

> 全スコープが揃った状態で最初からデプロイする場合は、この手順は不要です。
> 新しいユーザーはブラウザでの初回アクセス時に一括で承認されます。

## 環境変数（.env）

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `DEPLOY_ID` | GAS のデプロイ ID | （必須） |
| `GW_ACCESS` | Web App のアクセス範囲（`DOMAIN` / `MYSELF`） | `DOMAIN` |
| `GW_DOMAIN` | Google Workspace ドメイン（設定すると auth URL がドメイン限定形式になり、正しいアカウントで開きやすくなる） | （未設定） |

## npm scripts

| コマンド | 説明 |
|----------|------|
| `yarn build` | TypeScript ビルド + appsscript.json 生成 |
| `yarn push` | GAS にプッシュ |
| `yarn apply` | ビルド + プッシュ |
| `yarn deploy` | デプロイ（既存 ID があれば更新） |
| `yarn open` | GAS エディタを開く |
| `yarn signin` | clasp ログイン |
| `yarn setup` | GAS プロジェクト新規作成 |

## ディレクトリ構成

```
├── cli/
│   ├── myg              # CLI コマンド（bash + curl + jq）
│   ├── myg.ps1          # CLI コマンド（PowerShell 版）
│   └── myg.cmd          # Windows 用 cmd ラッパー
├── scripts/
│   ├── build            # ビルドスクリプト
│   ├── deploy           # デプロイスクリプト
│   ├── install          # ユーザー向けインストーラー（macOS / Linux）
│   └── install.ps1      # ユーザー向けインストーラー（Windows）
├── src/
│   ├── main.ts          # doGet/doPost エントリポイント（ルーティング）
│   ├── spreadsheet.ts   # Spreadsheet 操作
│   ├── docs.ts          # Docs 操作
│   ├── docs/
│   │   ├── markdown.ts  # Markdown → Google Docs 変換
│   │   └── highlight.ts # Docs 用ハイライトラッパー
│   ├── slides.ts        # Slides 操作
│   ├── slides/
│   │   └── markdown.ts  # Markdown → Google Slides 変換
│   ├── gmail.ts         # Gmail 操作
│   ├── drive.ts         # Drive 操作
│   ├── forms.ts         # Forms 操作
│   ├── tasks.ts         # Tasks 操作
│   ├── calendar.ts      # Calendar 操作
│   └── utils/
│       ├── id.ts        # 共通ヘルパー（resolveId）
│       ├── markdown.ts  # 共通 Markdown パーサー
│       ├── highlight.ts # 共通シンタックスハイライトエンジン
│       └── highlight-lang.ts # 言語定義（TS/JS, Python, Go, Bash, Ruby）
├── .env.example
└── package.json
```
