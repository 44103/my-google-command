# Contributing

myg へのコントリビュートありがとうございます！

---

## 開発環境

### 必要なもの

- Node.js 24 (mise または DevContainer で管理)
- yarn 4.13.0 (`packageManager` フィールドで固定済み)

### セットアップ方法

**方法 A: DevContainer (推奨)**

VS Code の Dev Containers 拡張から起動すれば自動で環境が整います。

**方法 B: mise**

```bash
mise install        # Node.js + yarn をインストール
yarn install        # 依存インストール
```

### 初回セットアップ (GAS プロジェクト作成)

```bash
# Google アカウントでログイン
yarn signin

# GAS プロジェクトを作成
yarn setup

# .env を作成し、DEPLOY_ID を記入
cp .env.example .env
```

`yarn setup` で `environments/dev/.clasp.json` が生成されます。

初回デプロイ後に表示される DEPLOY_ID を `.env` の `DEV_DEPLOY_ID` に記入してください。

---

## 開発フロー

### 1. ブランチを切る

```bash
git checkout -b feature/<issue-number>
```

### 2. コードを変更する

GAS 側のソースは `src/` 配下、CLI は `cli/myg` (bash) と `cli/myg.ps1` (PowerShell)。

### 3. 型チェック

```bash
npx tsc --noEmit
```

### 4. GAS にプッシュ＆デプロイ

```bash
yarn apply    # ビルド + GAS にプッシュ
yarn deploy   # デプロイ (新バージョン作成)
```

**重要**: `yarn apply` (push) してから `yarn deploy` の順で実行してください。
`deploy` だけだとコード変更が反映されません。

### 5. 動作確認

```bash
myg token     # 認証 URL を表示 (ブラウザでトークン取得)
myg token <TOKEN>  # トークン保存
```

> ⚠️ `myg auth` は `git reset --hard origin/main` を実行するため、**未コミットの変更が消えます**。
> 開発中は必ず `myg token` を使ってください。

### 6. コミット＆ PR

```bash
git add <files>
git commit -m "feat: description"
git push -u origin feature/<issue-number>
gh pr create --base main
```

---

## 環境の自動判定

`yarn apply` / `yarn deploy` はブランチを見て環境を切り替えます：

- `main` → prod (`environments/prod/.clasp.json` + `DEPLOY_ID`)
- それ以外 → dev (`environments/dev/.clasp.json` + `DEV_DEPLOY_ID`)

明示的に環境を指定することもできます：

```bash
yarn apply:dev     # 常に dev
yarn apply:prod    # 常に prod
yarn deploy:dev    # 常に dev
yarn deploy:prod   # 常に prod
```

CLI (`myg` コマンド) も同様にブランチで接続先を切り替えます。

---

## ブランチ運用

- `main` への直接 push は禁止 (Branch Protection で保護されています)
- すべての変更は Pull Request 経由でマージ

### ブランチ命名規則

| プレフィックス | 用途                   | 例                       |
| -------------- | ---------------------- | ------------------------ |
| `feature/`     | 新機能追加             | `feature/8`              |
| `fix/`         | バグ修正               | `fix/auth-token-expiry`  |
| `docs/`        | ドキュメントのみの変更 | `docs/update-readme`     |
| `refactor/`    | リファクタリング       | `refactor/extract-utils` |

---

## Pull Request のルール

1. PR は `main` ブランチに向けて作成してください
2. squash merge でマージされます (1 PR = 1 commit)
3. PR タイトルは変更内容が分かるように書いてください
4. GAS 側 (`src/`) の変更を含む場合は PR の説明に明記してください
5. 機能追加時は `cli/help.txt` と `README.md` の更新を忘れずに行ってください

### PR タイトルの書き方

変更内容が分かるように書いてください。

```
Add Google Forms response export
Fix range parameter ignored in sheet write
Update Calendar command examples
```

---

## スコープの承認

`appsscript.json` にスコープを追加した場合、GAS エディタで該当サービスを使う関数を一度手動実行して承認する必要があります。

```bash
yarn open  # GAS エディタを開く
```

エディタ上で対象の関数を選択して実行し、承認ダイアログを許可してください。

---

## 環境変数 (.env)

| 変数            | 説明                                         | デフォルト  |
| --------------- | -------------------------------------------- | ----------- |
| `DEPLOY_ID`     | 本番 GAS デプロイ ID                         | (必須)      |
| `DEV_DEPLOY_ID` | 開発 GAS デプロイ ID                         | (任意)      |
| `GW_ACCESS`     | Web App のアクセス範囲 (`DOMAIN` / `MYSELF`) | `DOMAIN`    |
| `GW_DOMAIN`     | Google Workspace ドメイン                    | (未設定)    |

---

## 設定ファイル (config.yaml)

GAS 側のカスタマイズ可能な設定は `config.yaml` で管理します。ビルド時に TypeScript に変換されます。

### セットアップ

```bash
cp config.example.yaml config.yaml
# 必要に応じて値を編集
```

`config.yaml` は `.gitignore` で除外されているため、デプロイ環境ごとに異なる設定が可能です。
ファイルが存在しない場合はデフォルト値が適用されます。

### 設定項目

| 項目          | 説明                                         | デフォルト  |
| ------------- | -------------------------------------------- | ----------- |
| `aclMode`     | ファイル ACL のデフォルトポリシー             | `blacklist` |
| `feedbackUrl` | フィードバックフォームの URL                 | (空文字)    |
| `authMessage` | 認証画面に表示するカスタムメッセージ         | (空文字)    |

### 設定例

```yaml
# config.yaml
aclMode: "blacklist"
feedbackUrl: "https://example.com/feedback"
authMessage: "<strong>注意:</strong> このトークンは社内システム専用です。"
```

### ACL_MODE の詳細

`ACL_MODE` はファイルアクセス時の既定ポリシーを制御します。ビルド時に `src/config.ts` が `dist/config.js` として生成され、GAS 側の定数として埋め込まれます。

| モード | ACL 未設定ファイルへのアクセス | 用途 |
| --- | --- | --- |
| `whitelist` | 拒否。`myg acl file <ID> readonly` 等で事前許可が必要 | 安全重視。意図しないファイル操作を防ぐ |
| `blacklist` | 許可。アクセス時にフットプリント (`acl=r`) を自動記録 | 利便性重視。従来互換 |

#### 権限解決ロジック (resolvePermission)

以下の優先順で判定されます:

1. `acl=-` (明示的 deny) → 常に拒否
2. `acl=w` (read+write 許可) → 常に許可
3. `acl=r` (read-only) → read は許可、write は拒否
4. ACL 未設定 → `ACL_MODE` のデフォルトポリシーに従う

エラー時は操作に必要な権限レベル (`readonly` or `full`) のコマンドが案内されます。

#### 設定変更の反映

```bash
# config.yaml を編集
aclMode: "whitelist"

# ビルド + プッシュ + デプロイで反映
yarn apply && yarn deploy
```

---

## npm scripts

| コマンド           | 説明                                     |
| ------------------ | ---------------------------------------- |
| `yarn build`       | TypeScript ビルド + appsscript.json 生成 |
| `yarn apply`       | ビルド + GAS にプッシュ (環境自動判定)   |
| `yarn apply:dev`   | ビルド + dev にプッシュ                  |
| `yarn apply:prod`  | ビルド + prod にプッシュ                 |
| `yarn deploy`      | デプロイ (環境自動判定)                  |
| `yarn deploy:dev`  | dev にデプロイ                           |
| `yarn deploy:prod` | prod にデプロイ                          |
| `yarn open`        | GAS エディタを開く                       |
| `yarn signin`      | clasp ログイン                           |
| `yarn setup`       | GAS プロジェクト新規作成                 |

---

## ディレクトリ構成

```
├── cli/
│   ├── myg              # CLI (bash)
│   ├── myg.ps1          # CLI (PowerShell)
│   └── myg.cmd          # Windows 用ラッパー
├── environments/
│   ├── dev/.clasp.json  # 開発用 scriptId (.gitignore)
│   └── prod/.clasp.json # 本番用 scriptId (.gitignore)
├── scripts/
│   ├── build            # ビルド
│   ├── apply            # ビルド + プッシュ
│   ├── deploy           # デプロイ
│   ├── setup            # GAS プロジェクト作成
│   ├── install          # ユーザー向けインストーラー (macOS/Linux)
│   └── install.ps1      # ユーザー向けインストーラー (Windows)
├── src/
│   ├── main.ts          # doGet/doPost エントリポイント
│   ├── acl.ts           # ACL (アクセス制御)
│   ├── config.generated.ts  # ビルド時に生成 (.gitignore)
│   ├── spreadsheet.ts   # Spreadsheet
│   ├── docs.ts          # Docs
│   ├── gmail.ts         # Gmail
│   ├── drive.ts         # Drive
│   ├── slides.ts        # Slides
│   ├── forms.ts         # Forms
│   ├── tasks.ts         # Tasks
│   ├── calendar.ts      # Calendar
│   ├── contacts.ts      # Contacts
│   ├── gas.ts           # GAS (Apps Script)
│   ├── comments.ts      # Comments
│   └── utils/           # 共通ユーティリティ
├── config.example.yaml  # 設定ファイルテンプレート
├── config.yaml          # 設定ファイル (.gitignore)
├── .env.example
├── mise.toml
└── package.json
```

---

## 質問・相談

Issue や PR のコメントで気軽に聞いてください。
