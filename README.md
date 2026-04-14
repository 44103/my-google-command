# myg - My Google Workspace CLI

Google Workspace（Spreadsheet, Docs, Gmail, Tasks, Calendar）を CLI から操作するツールです。
GAS（Google Apps Script）を自分専用のプロキシとして使い、`curl` 経由でアクセスします。

## ユーザー向け（使う人）

### 必要なもの

**macOS / Linux:**
- bash, curl, jq
- ブラウザ（初回認証用）

**Windows:**
- PowerShell 5.1 以上（Windows 10 標準搭載）
- ブラウザ（初回認証用）

### セットアップ（macOS / Linux）

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
./scripts/install
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

### セットアップ（Windows）

1. リポジトリをクローン

```powershell
git clone <repository-url>
cd my-google-command
```

2. `.env` を作成

```powershell
Copy-Item .env.example .env
```

実装者から共有された `DEPLOY_ID` を `.env` に記入してください。

3. インストール

```powershell
.\scripts\install.ps1
```

`%LOCALAPPDATA%\myg\bin` に `myg.cmd` がインストールされます。
PATH への追加を確認されるので、`y` を入力してください（ターミナルの再起動が必要です）。

4. 認証

```powershell
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
myg sheet create id=<ID> "name=<SHEET_NAME>"        # 新しいシートを作成
echo "A,B,C" | myg sheet write id=<ID> "name=<SHEET_NAME>"          # CSV データ書き込み
cat data.csv | myg sheet write id=<ID> "name=<SHEET_NAME>" range=B2  # 範囲指定で書き込み

# --- Docs（読み取り） ---
myg docs                                            # 一覧取得
myg doc id=<ID>                                     # ドキュメント内容取得
myg doc "id=<URL>"                                  # URL でも OK

# --- Docs（書き込み） ---
myg doc create name="タイトル"                       # 新規作成
echo "初期内容" | myg doc create name="メモ"          # 新規作成 + 本文
echo "追加テキスト" | myg doc append id=<ID>          # 末尾に追記
myg doc append id=<ID> < memo.txt                    # ファイルから追記
myg doc overwrite id=<ID> < new.txt                  # 上書き
cat README.md | myg doc overwrite id=<ID> format=markdown  # Markdown 装飾付き

# --- Gmail ---
myg mails                                           # 受信トレイ最新20件
myg mails "q=is:unread" max=5                       # 検索クエリで絞り込み
myg mails "q=from:someone@example.com"              # 送信者で検索
myg mail id=<MESSAGE_ID>                            # メール本文取得
echo "本文" | myg mail draft to=someone@example.com subject="件名"  # 下書き作成
echo "本文" | myg mail draft id=<DRAFT_ID> to=someone@example.com subject="件名"  # 下書き更新
myg mail draft delete id=<DRAFT_ID>                                              # 下書き削除

# --- Gmail フィルタ ---
myg mail filters                                         # フィルタ一覧
myg mail filter create q="from:someone@example.com" label="Work"  # フィルタ作成
myg mail filter delete id=<FILTER_ID>                    # フィルタ削除

# --- Drive ---
myg files                                           # ルートフォルダ一覧（デフォルト20件）
myg files id=<FOLDER_ID> max=10                     # フォルダ内一覧
myg file id=<FILE_ID>                               # ファイルダウンロード（テキスト）
echo "content" | myg file upload folder=<FOLDER_ID> name="memo.txt"  # テキストアップロード
myg file upload folder=<FOLDER_ID> name="photo.png" file=./photo.png  # ファイル指定アップロード
myg file move id=<FILE_ID> folder=<FOLDER_ID>       # ファイル移動
myg file copy id=<FILE_ID>                          # 同じフォルダにコピー
myg file copy id=<FILE_ID> folder=<FOLDER_ID> name="コピー"  # フォルダ・名前指定でコピー

# --- Slides（読み取り） ---
myg slides                                          # 一覧取得
myg slides max=10                                   # 件数指定
myg slide id=<ID>                                   # 全ページのテキスト取得
myg slide "id=<URL>"                                # URL でも OK
myg slide id=<ID> page=3                            # 特定ページだけ取得

# --- Slides（書き込み） ---
myg slide create name="プレゼン名"                    # 新規作成
myg slide addpage id=<ID>                            # 空白ページ追加
myg slide addtext id=<ID> page=1 text="テキスト"      # テキストボックス追加
echo "長いテキスト" | myg slide addtext id=<ID> page=1  # stdin からも可

# --- Forms ---
myg forms                                           # フォーム一覧
myg form id=<ID>                                    # 質問一覧・詳細
myg form "id=<URL>"                                 # URL でも OK
myg form responses id=<ID>                          # 回答一覧
myg form create name="アンケート"                    # 新規作成
myg form create name="アンケート" description="説明"  # 説明付き
myg form additem id=<ID> type=text title="名前" required          # テキスト（必須）
myg form additem id=<ID> type=paragraph title="詳細"              # 長文テキスト
myg form additem id=<ID> type=choice title="Q" "choices=A,B,C"   # ラジオボタン
myg form additem id=<ID> type=checkbox title="Q" "choices=A,B,C" # チェックボックス
myg form additem id=<ID> type=dropdown title="Q" "choices=A,B,C" # プルダウン
myg form additem id=<ID> type=scale title="評価" low=1 high=10 lowLabel="低" highLabel="高"  # スケール

# --- Contacts ---
myg contacts                                        # 個人の連絡先一覧
myg contacts search q="松尾"                         # 組織ディレクトリ検索
myg contact id=<RESOURCE_NAME>                      # 連絡先詳細（上司・従業員ID等）

# --- Tasks ---
myg tasklists                                       # タスクリスト一覧
myg tasks id=<TASKLIST_ID>                          # タスク一覧
myg task create id=<TASKLIST_ID> title="タスク名"    # タスク作成
myg task create id=<TASKLIST_ID> title="タスク名" due=2026-04-10  # 期限付き
myg task create id=<TASKLIST_ID> title="タスク名" due=2026-04-10 notes="詳細メモ"  # 説明付き
myg task update id=<TASKLIST_ID> task=<TASK_ID> title="新しいタイトル"  # タスク更新
myg task update id=<TASKLIST_ID> task=<TASK_ID> notes="説明を追加"     # 説明を追加
myg task delete id=<TASKLIST_ID> task=<TASK_ID>     # タスク削除
myg task done id=<TASKLIST_ID> task=<TASK_ID>       # タスク完了

# --- Calendar ---
myg calendars                                       # カレンダー一覧
myg events id=self                                  # 自分のカレンダー（今後7日間）
myg events id=<CAL_ID> from=2026-04-08 to=2026-04-15  # 日付範囲指定
myg event create id=self title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00
myg event create id=<CAL_ID> title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 location="会議室A"
myg event freebusy emails=a@example.com,b@example.com                    # 空き時間検索（今日、30分枠）
myg event freebusy emails=a@example.com,b@example.com from=2026-04-14 to=2026-04-18 duration=60  # 日付範囲・時間枠指定
```

Gmail の `q` パラメータは [Gmail の検索構文](https://support.google.com/mail/answer/7190) がそのまま使えます。

### Docs 書き込みについて

書き込み系コマンド（`create` / `append` / `overwrite`）は本文を stdin から受け取ります。

> ⚠️ `overwrite` は既存の内容をすべて置き換えます。実行前に内容を確認してから使うことを推奨します。

| サブコマンド | 説明 | stdin |
|-------------|------|-------|
| `doc create name="TITLE"` | 新規ドキュメント作成 | あれば本文に設定 |
| `doc append id=<ID>` | 末尾に追記 | 必須 |
| `doc overwrite id=<ID>` | 全体を上書き | 必須 |

`format=markdown` を付けると、Markdown を Google Docs のスタイル（見出し、リスト、コードブロック、テーブル、リンク等）に変換して書き込みます。

### シンタックスハイライト

Markdown のコードブロックに言語を指定すると、Google Docs 上でシンタックスハイライトが適用されます。

対応言語：

| 言語 | 指定方法 |
|------|----------|
| TypeScript / JavaScript | `ts`, `typescript`, `js`, `javascript`, `jsx`, `tsx` |
| Python | `python`, `py` |
| Go | `go`, `golang` |
| Shell | `bash`, `sh`, `shell`, `zsh` |
| Ruby | `ruby`, `rb` |

コードブロックはダークテーマ（One Dark 風）で表示されます。コメント・文字列・キーワード・組み込み関数・数値を色分けします。言語指定がない場合はハイライトなしの等幅フォント表示になります。

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
