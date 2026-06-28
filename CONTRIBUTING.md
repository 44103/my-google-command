# Contributing

myg へのコントリビュートありがとうございます！

## 開発の始め方

開発環境のセットアップは [DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。

## ブランチ運用

- `main` への直接 push は禁止です（Branch Protection で保護されています）
- すべての変更は Pull Request 経由でマージします

### ブランチ命名規則

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `feature/` | 新機能追加 | `feature/file-trash` |
| `fix/` | バグ修正 | `fix/auth-token-expiry` |
| `docs/` | ドキュメントのみの変更 | `docs/update-readme` |
| `refactor/` | リファクタリング | `refactor/extract-utils` |

## Pull Request のルール

1. PR は `main` ブランチに向けて作成してください
2. squash merge でマージされます（1 PR = 1 commit）
3. PR タイトルは変更内容が分かるように書いてください（リリースノートに使われます）
4. GAS 側（`src/`）の変更を含む場合は PR の説明に明記してください

### PR タイトルの書き方

```
feat: Google Forms の回答エクスポートに対応
fix: sheet write で range 指定が無視される問題を修正
docs: Calendar コマンドの使用例を追加
```

プレフィックスは任意ですが、付けると変更種別が分かりやすくなります。

## GAS デプロイについて

GAS のデプロイ（`yarn deploy`）はリポジトリ管理者が行います。
コントリビューターが直接デプロイする必要はありません。

GAS 側の変更を含む PR がマージされた後、管理者がデプロイします。

## テスト

現在は自動テストの仕組みがないため、PR には動作確認の手順を記載してください。

## 質問・相談

Issue や PR のコメントで気軽に聞いてください。
