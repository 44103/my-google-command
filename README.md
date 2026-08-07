# myg - My Google Workspace CLI

Google Workspace (Spreadsheet, Docs, Gmail, Tasks, Calendar) を CLI から操作するツールです。
GAS (Google Apps Script) を自分専用のプロキシとして使い、`curl` 経由でアクセスします。

## ユーザー向け (使う人)

### 必要なもの

**macOS / Linux:**

- bash, curl, jq
- ブラウザ (初回認証用)

**Windows:**

- PowerShell 5.1 以上 (Windows 10 標準搭載)
- ブラウザ (初回認証用)

### セットアップ (macOS / Linux)

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

Node.js 18+ がインストールされている場合、ローカル daemon が自動的に起動し、ブラウザからトークンが自動送信されます（コピペ不要）。

Node.js がない場合や daemon の起動に失敗した場合は、従来どおりトークンをコピペする方式にフォールバックします。

> トークンは約 1 時間で期限切れになります。切れたら再度 `myg auth` を実行してください。

> `myg auth` 実行時に自動で `git pull` が行われます。更新があった場合はコミットログが表示されます。

#### Daemon 管理

```bash
# daemon の起動（通常は myg auth 時に自動起動）
myg daemon start

# daemon の状態確認
myg daemon status

# daemon の停止
myg daemon stop
```

Daemon は `127.0.0.1:19333` で動作します。ポートを変更する場合は環境変数 `MYG_DAEMON_PORT` を設定してください。

起動に失敗した場合、`/tmp/myg-daemon.log`（Windows: `%TEMP%\myg-daemon.log`）にエラーログが記録されます。

#### 非対話環境 (IDE・TUI) での認証

`myg auth` が stdin を待てない環境 (Kiro CLI、IDE 内ターミナル等) では、`myg token` を使ってください。

```bash
# 認証 URL を表示
myg token

# ブラウザで URL を開き、トークンをコピーしてから保存
myg token ya29.a0ARrdaM...
```

### セットアップ (Windows)

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

> 実行ポリシーのエラーが出る場合 (Google Drive 上で作業している場合など):
>
> ```powershell
> powershell -ExecutionPolicy Bypass -File ".\scripts\install.ps1"
> ```

`%LOCALAPPDATA%\myg\bin` に `myg.cmd` がインストールされます。
PATH への追加を確認されるので、`y` を入力してください (ターミナルの再起動が必要です)。

4. 認証

```powershell
myg auth
```

ブラウザが開きます。初回は Google の承認ダイアログが表示されるので、すべて許可してください。
トークンが表示されたら「Copy Token」ボタンでコピーし、ターミナルに戻ってペーストしてください。

> トークンは約 1 時間で期限切れになります。切れたら再度 `myg auth` を実行してください。

> `myg auth` 実行時に自動で `git pull` が行われます。更新があった場合はコミットログが表示されます。

### 使い方

```bash
myg help        # 全コマンドのヘルプを表示
myg feedback    # フィードバックフォームをブラウザで開く
```

<details>
<summary>Spreadsheet</summary>

```bash
myg spreadsheets                                    # 一覧取得
myg spreadsheet id=<ID>                             # シート一覧 (名前+gid)
myg spreadsheet "id=<URL>"                          # URL でも OK
myg spreadsheet create name="タイトル"              # 新規作成
myg sheet id=<ID> "name=<SHEET_NAME>"               # シートデータ取得
myg sheet id=<ID> "name=<SHEET_NAME>" range=A1:D100  # 範囲指定でデータ取得
myg sheet id=<ID> "name=<SHEET_NAME>" rows=5         # 先頭 5 行のみ取得 (ヘッダ確認用)
myg sheet id=<ID> "name=<SHEET_NAME>" colors=false   # 背景色情報を省略
myg sheet id=<ID> "name=<SHEET_NAME>" range=A1:D100 rows=10 colors=false  # 組み合わせ
myg sheet "id=<URL with gid>"                       # URL の gid= で自動シート選択
myg sheet create id=<ID> "name=<SHEET_NAME>"        # 新しいシートを作成
myg sheet delete id=<ID> "name=<SHEET_NAME>"        # シートを削除
myg sheet rename id=<ID> "name=<SHEET_NAME>" "newname=<NEW_NAME>"  # シートをリネーム
myg sheet lastrow id=<ID> "name=<SHEET_NAME>"       # 最終行番号を取得
echo "A,B,C" | myg sheet write id=<ID> "name=<SHEET_NAME>"          # CSV データ書き込み
cat data.csv | myg sheet write id=<ID> "name=<SHEET_NAME>" range=B2  # 範囲指定で書き込み
echo "名前,部署" | myg sheet write id=<ID> "name=<SHEET_NAME>" header=true  # 1 行目をヘッダ化 (太字+背景色+固定)

# メモ
myg sheet notes id=<ID> "name=<SHEET_NAME>"                         # メモ一覧 (デフォルト A1:Z1000)
myg sheet notes id=<ID> "name=<SHEET_NAME>" range=A1:C10            # 範囲指定
echo "メモ内容" | myg sheet note set id=<ID> "name=<SHEET_NAME>" cell=A1  # メモ設定
myg sheet note clear id=<ID> "name=<SHEET_NAME>" cell=A1            # メモ削除

# 背景色
myg sheet color id=<ID> "name=<SHEET_NAME>" cell=A1 color=#ff0000   # セルの背景色を設定
myg sheet color id=<ID> "name=<SHEET_NAME>" range=A1:C3 color=#ff0000  # 範囲指定で背景色を設定
myg sheet color id=<ID> "name=<SHEET_NAME>" range=A1:C3 color=-     # 背景色をクリア

# XLSX 読み取り
myg spreadsheet id=<XLSX_FILE_ID>                   # XLSX のシート一覧 (読み取り専用)
myg sheet id=<XLSX_FILE_ID> "name=<SHEET_NAME>"     # XLSX のシートデータ取得
```

リッチテキスト記法: `{red}text{/red}` `{blue}` `{green}` `{bold}` `{italic}` (組み合わせ可: `{red,bold}`)

</details>

<details>
<summary>Docs</summary>

```bash
# 読み取り
myg docs                                            # 一覧取得
myg doc id=<ID>                                     # ドキュメント内容取得
myg doc "id=<URL>"                                  # URL でも OK
myg doc tabs id=<ID>                                # タブ一覧 (ネスト構造で表示)

# 書き込み
myg doc create name="タイトル"                       # 新規作成
echo "初期内容" | myg doc create name="メモ"          # 新規作成 + 本文
echo "追加テキスト" | myg doc append id=<ID>          # 末尾に追記
myg doc append id=<ID> < memo.txt                    # ファイルから追記
myg doc overwrite id=<ID> < new.txt                  # 上書き
cat README.md | myg doc overwrite id=<ID> format=markdown  # Markdown 装飾付き

# タブ操作
myg doc addtab id=<ID> name="新しいタブ"             # タブ追加
myg doc addtab id=<ID> name="子タブ" parent=<TAB_ID> # 子タブとして追加
myg doc renametab id=<ID> tab=<TAB_ID> name="新名"   # タブ名変更
myg doc movetab id=<ID> tab=<TAB_ID> index=0         # タブ移動
myg doc copytab id=<ID> tab=<TAB_ID> name="コピー"   # タブ複製 (スタイル保持)
```

> ⚠️ `overwrite` は既存の内容をすべて置き換えます。実行前に内容を確認してから使うことを推奨します。

`format=markdown` を付けると、Markdown を Google Docs のスタイル (見出し、リスト、コードブロック、テーブル、リンク等) に変換して書き込みます。

**スマートチップ (プレースホルダー)**

| プレースホルダー               | 変換先                        | 例                                             |
| ------------------------------ | ----------------------------- | ---------------------------------------------- |
| `{{ DATE }}`                   | 当日の日付チップ              | `会議日: {{ DATE }}`                           |
| `{{ DATE:YYYY-MM-DD }}`        | 指定日の日付チップ            | `期限: {{ DATE:2026-05-01 }}`                  |
| `{{ DATE:YYYY-MM-DD:locale }}` | locale 指定の日付チップ       | `Due: {{ DATE:2026-05-01:en }}`                |
| `{{ PERSON:メールアドレス }}`  | 参加者チップ                  | `担当: {{ PERSON:user@example.com }}`          |
| `{{ LINK:URL }}`               | リッチリンク (スマートチップ) | `参照: {{ LINK:https://docs.google.com/... }}` |
| `{{ IMAGE:URL or FILE_ID }}`   | インライン画像                | `図: {{ IMAGE:1abc...xyz }}`                   |

`format=markdown` でもプレーンテキストでも、`tab=` 指定でも動作します。日付チップのデフォルト locale は `en` (英語) です。

**シンタックスハイライト**

Markdown のコードブロックに言語を指定すると、Google Docs 上でシンタックスハイライト (One Dark 風) が適用されます。

対応言語: `ts` `typescript` `js` `javascript` `jsx` `tsx` `python` `py` `go` `golang` `bash` `sh` `shell` `zsh` `ruby` `rb`

</details>

<details>
<summary>Gmail</summary>

```bash
myg mails                                           # 受信トレイ最新 20 件
myg mails "q=is:unread" max=5                       # 検索クエリで絞り込み
myg mails "q=from:someone@example.com"              # 送信者で検索
myg mail id=<MESSAGE_ID>                            # メール本文取得
echo "本文" | myg mail draft to=someone@example.com subject="件名"  # 下書き作成
echo "本文" | myg mail draft to=someone@example.com subject="件名" cc=a@example.com bcc=b@example.com  # CC/BCC 付き
echo "本文" | myg mail draft id=<DRAFT_ID> to=someone@example.com subject="件名"  # 下書き更新
myg mail draft delete id=<DRAFT_ID>                 # 下書き削除

# フィルタ・ラベル
myg mail filters                                         # フィルタ一覧
myg mail filter create q="from:someone@example.com" label="Work"  # フィルタ作成
myg mail filter delete id=<FILTER_ID>                    # フィルタ削除
myg mail labels                                          # ラベル一覧
myg mail label q="is:unread" label="要対応"              # 条件に合うメールにラベル付与
```

`q` パラメータは [Gmail の検索構文](https://support.google.com/mail/answer/7190) がそのまま使えます。

</details>

<details>
<summary>Drive</summary>

```bash
myg files                                           # ルートフォルダ一覧 (デフォルト 20 件)
myg files id=<FOLDER_ID> max=10                     # フォルダ内一覧
myg files search q="keyword"                        # Drive 全体のファイル検索
myg file id=<FILE_ID>                               # ファイルダウンロード (テキスト)
echo "content" | myg file upload folder=<FOLDER_ID> name="memo.txt"  # テキストアップロード
myg file upload folder=<FOLDER_ID> name="photo.png" file=./photo.png  # ファイル指定アップロード
myg file move id=<FILE_ID> folder=<FOLDER_ID>       # ファイル移動
myg file mkdir name="新フォルダ"                     # フォルダ作成 (ルート)
myg file mkdir name="新フォルダ" folder=<FOLDER_ID>  # フォルダ作成 (親指定)
myg file rename id=<FILE_ID> name="新しい名前"      # ファイル/フォルダ名変更
myg file copy id=<FILE_ID>                          # 同じフォルダにコピー
myg file copy id=<FILE_ID> folder=<FOLDER_ID> name="コピー"  # フォルダ・名前指定でコピー
myg file delete id=<FILE_ID>                        # ファイルをゴミ箱に移動
myg file shortcut id=<FILE_ID>                      # ショートカット作成
myg file shortcut id=<FILE_ID> folder=<FOLDER_ID>   # フォルダ指定でショートカット作成
myg file history id=<FILE_ID>                       # 変更履歴を取得
myg file diff id=<FILE_ID> rev1=<REV_ID> rev2=<REV_ID>  # リビジョン間の差分を取得

# 共有設定
myg file share id=<FILE_ID>                                          # 共有設定一覧
myg file share id=<FILE_ID> email=user@example.com role=reader       # ユーザーに共有 (閲覧者)
myg file share id=<FILE_ID> email=user@example.com role=writer       # ユーザーに共有 (編集者)
myg file share id=<FILE_ID> type=domain domain=example.com role=reader  # ドメイン全体に共有
myg file share id=<FILE_ID> type=anyone role=reader                  # リンクを知っている全員に共有
myg file unshare id=<FILE_ID> permission=<PERMISSION_ID>             # 共有を解除
```

</details>

<details>
<summary>Slides</summary>

```bash
# 読み取り
myg slides                                          # 一覧取得
myg slides max=10                                   # 件数指定
myg slide id=<ID>                                   # 全ページのテキスト取得
myg slide "id=<URL>"                                # URL でも OK
myg slide id=<ID> page=3                            # 特定ページだけ取得

# 書き込み
myg slide create name="プレゼン名"                    # 新規作成
myg slide addpage id=<ID>                            # 空白ページ追加
myg slide addtext id=<ID> page=1 text="テキスト"      # テキストボックス追加
echo "長いテキスト" | myg slide addtext id=<ID> page=1  # stdin からも可
cat deck.md | myg slide overwrite id=<ID> format=markdown  # Markdown からスライド上書き

# 既存要素の検査・調整（座標と寸法の単位はポイント）
myg slide inspect id=<ID>                            # 全ページの図形・書式を取得
myg slide inspect id=<ID> page=2                     # 特定ページだけ取得
# 混在書式は textRuns、段落ごとの行間は paragraphs に詳細が出力される

myg slide thumbnail id=<ID> page=2 output=slide.png  # ページのPNGサムネイルを保存
echo "差し替えテキスト" | myg slide text update id=<ID> page=2 shape=<OBJECT_ID>
myg slide text style id=<ID> page=2 shape=<OBJECT_ID> size=28
myg slide shape update id=<ID> page=2 shape=<OBJECT_ID> x=40 y=60 width=320 height=120

# 更新せず、変更前後の値だけ確認
echo "差し替えテキスト" | myg slide text update id=<ID> page=2 shape=<OBJECT_ID> dry-run=true
myg slide text style id=<ID> page=2 shape=<OBJECT_ID> size=28 dry-run=true
myg slide shape update id=<ID> page=2 shape=<OBJECT_ID> x=40 dry-run=true

# スピーカーノート
myg slide notes id=<ID>                              # 全ページのノート取得
myg slide notes id=<ID> page=3                       # 特定ページのノート取得
echo "発表メモ" | myg slide note set id=<ID> page=1   # ノート設定
myg slide note clear id=<ID> page=1                  # ノート削除
```

</details>

<details>
<summary>Forms</summary>

```bash
myg forms                                           # フォーム一覧
myg form id=<ID>                                    # 質問一覧・詳細
myg form "id=<URL>"                                 # URL でも OK
myg form responses id=<ID>                          # 回答一覧
myg form create name="アンケート"                    # 新規作成
myg form create name="アンケート" description="説明"  # 説明付き
myg form additem id=<ID> type=text title="名前" required          # テキスト (必須)
myg form additem id=<ID> type=paragraph title="詳細"              # 長文テキスト
myg form additem id=<ID> type=choice title="Q" "choices=A,B,C"   # ラジオボタン
myg form additem id=<ID> type=checkbox title="Q" "choices=A,B,C" # チェックボックス
myg form additem id=<ID> type=dropdown title="Q" "choices=A,B,C" # プルダウン
myg form additem id=<ID> type=scale title="評価" low=1 high=10 lowLabel="低" highLabel="高"  # スケール
```

</details>

<details>
<summary>Calendar</summary>

```bash
myg calendars                                       # カレンダー一覧
myg events id=self                                  # 自分のカレンダー (今後 7 日間)
myg events id=<CAL_ID> from=2026-04-08 to=2026-04-15  # 日付範囲指定
myg event create id=self title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00
myg event create id=<CAL_ID> title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 location="会議室A"
myg event create id=self title="英会話" start=2026-04-10T16:00:00 end=2026-04-10T16:30:00 color=tomato
myg event create id=self title="定例" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 description="議題: Q2振り返り"
myg event create id=self title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 guests=a@example.com,b@example.com
myg event create id=self title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 visibility=private
myg event create id=self title="会議" start=2026-04-10T10:00:00 end=2026-04-10T11:00:00 reminders=10,30
myg event update id=self event=<EVENT_ID> title="新しいタイトル"
myg event update id=self event=<EVENT_ID> color=peacock
myg event update id=self event=<EVENT_ID> guests=a@example.com,b@example.com
myg event delete id=self event=<EVENT_ID>
myg event freebusy emails=a@example.com,b@example.com
myg event freebusy emails=a@example.com,b@example.com from=2026-04-14 to=2026-04-18 duration=60
myg event rooms
myg event rooms q="会議室A"
```

色名: `lavender` `sage` `grape` `flamingo` `banana` `tangerine` `peacock` `graphite` `blueberry` `basil` `tomato` (数字 `1`〜`11` でも可)

</details>

<details>
<summary>Tasks</summary>

```bash
myg tasklists                                       # タスクリスト一覧
myg tasklist create title="買い物"                   # タスクリスト作成
myg tasklist update id=<TASKLIST_ID> title="新しい名前"  # タスクリスト名変更
myg tasklist delete id=<TASKLIST_ID>                 # タスクリスト削除
myg tasks id=<TASKLIST_ID>                          # タスク一覧
myg tasks completed id=<TASKLIST_ID>                # 完了済みタスク一覧
myg task create id=<TASKLIST_ID> title="タスク名"    # タスク作成
myg task create id=<TASKLIST_ID> title="タスク名" due=2026-04-10  # 期限付き
myg task create id=<TASKLIST_ID> title="タスク名" due=2026-04-10 notes="詳細メモ"  # 説明付き
myg task create id=<TASKLIST_ID> title="サブタスク" parent=<TASK_ID>  # サブタスク作成
myg task update id=<TASKLIST_ID> task=<TASK_ID> title="新しいタイトル"  # タスク更新
myg task update id=<TASKLIST_ID> task=<TASK_ID> notes="説明を追加"     # 説明を追加
myg task delete id=<TASKLIST_ID> task=<TASK_ID>     # タスク削除
myg task done id=<TASKLIST_ID> task=<TASK_ID>       # タスク完了
```

</details>

<details>
<summary>Contacts</summary>

```bash
myg contacts                                        # 個人の連絡先一覧
myg contacts search q="松尾"                         # 組織ディレクトリ検索
myg contact id=<RESOURCE_NAME>                      # 連絡先詳細 (上司・従業員 ID 等)
```

</details>

<details>
<summary>Comments (Docs/Sheets/Slides 共通)</summary>

```bash
myg comments id=<FILE_ID>                           # コメント一覧
myg comments "id=<URL>"                             # URL でも OK
echo "本文" | myg comment create id=<FILE_ID>       # コメント追加
echo "新内容" | myg comment update id=<FILE_ID> comment=<COMMENT_ID>  # コメント更新
myg comment delete id=<FILE_ID> comment=<COMMENT_ID>                  # コメント削除
```

</details>

<details>
<summary>GAS (Apps Script)</summary>

```bash
myg gas info script=<SCRIPT_ID>                     # プロジェクト情報
myg gas info "script=https://script.google.com/d/<ID>/edit"  # URL でも OK
myg gas deployments script=<SCRIPT_ID>              # デプロイ一覧
myg gas versions script=<SCRIPT_ID>                 # バージョン履歴
myg gas files script=<SCRIPT_ID>                    # ソースファイル一覧
myg gas file script=<SCRIPT_ID> name=Code           # ソースコード表示
```

</details>

<details>
<summary>ACL (アクション権限設定)</summary>

`.permission.json` をリポジトリルートに作成すると、使用できるアクションを制限できます。
このファイルは Git 管理外 (`.gitignore` 済み) なので、ユーザーごとに設定できます。

**myg acl コマンドで管理する (推奨)**

```bash
# 現在の設定を表示
myg acl command

# 特定コマンドを使用禁止に
myg acl command deny "file move"
myg acl command deny "file share"

# 使用禁止を解除
myg acl command remove "file move"

# 全制限をリセット
myg acl command reset
```

ファイル単位の ACL 管理:

```bash
# ファイルの現在のACL設定を表示
myg acl file id=<FILE_ID>

# ファイルへの myg アクセスを禁止
myg acl file id=<FILE_ID> deny

# 読み取り専用に設定
myg acl file id=<FILE_ID> readonly

# 読み書き許可に設定
myg acl file id=<FILE_ID> full
```

**閲覧のみファイルの ACL**

Drive 上で「閲覧のみ」のファイルに対して ACL を設定した場合、永続的な保存ができないため、ACL は一時的に保存されます。

- **persistent**: 編集権限があるファイル。永続的に保存され、設定者情報も記録される
- **temporary**: 閲覧のみファイル。10分間有効で、期限切れ後は再設定が必要

CLI の出力で保存状態を確認できます:

```
File:  共有ドキュメント
ACL:   readonly (temporary, expires in 10 minutes)
```

**ファイル ACL モード (ACL_MODE)**

`.env` の `ACL_MODE` でファイルアクセスの既定ポリシーを切り替えられます。

- `whitelist` (デフォルト): 明示的に許可したファイルのみアクセス可能
- `blacklist`: 明示的に拒否したファイル以外はアクセス可能

詳しくは [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

> `deny` と `allow` は排他です。片方を使っている場合、もう片方を追加するには先に `myg acl command reset` が必要です。

**.permission.json を直接編集する場合**

deny 方式 (指定したアクションだけ拒否、他は全許可):

```json
{
  "deny": ["mail draft", "file upload", "contacts", "contacts search"]
}
```

allow 方式 (指定したアクションだけ許可、他は全拒否):

```json
{
  "allow": [
    "docs",
    "doc",
    "doc tabs",
    "doc append",
    "doc overwrite",
    "spreadsheets",
    "sheet"
  ]
}
```

- ファイルがない場合はすべてのアクションが許可されます
- アクション名はコマンドと同じ形式です (例: `doc create`, `mail draft`, `event freebusy`)
- サブコマンドなしのアクション (`docs`, `mails` 等) はそのまま指定します
- `./scripts/install` 実行時に対話形式で作成することもできます

</details>

---

## 開発者向け

開発・デプロイについては [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
