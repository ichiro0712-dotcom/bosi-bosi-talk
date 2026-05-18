# BOSHI×BOSHI Talk — 開発ルール

このリポジトリで作業する Claude (および全てのコントリビューター) は、
以下のルールを **必ず** 守ること。

---

## 1. デプロイ・ブランチ運用

- **main 直接 push OK**: feature ブランチを切らずに直接コミット → push する。
  Vercel が main への push で自動的に本番デプロイする。
- PR レビューは省略してよい (個人プロジェクトのため)。
- 破壊的操作 (`git reset --hard`, `--force` push, branch -D など) は事前確認すること。

---

## 2. 機能を追加・変更したときの **同期更新ルール** (最重要)

もちに新しい tool / 機能を追加したり、既存の機能の挙動を変えたりしたとき、
以下を **同じコミット (または同じ作業セッション)** で必ず更新する:

### 必須の同期更新先

1. **`APP_SPEC.md`**
   - 追加した tool は「もち」セクションの tool 一覧表に記載
   - 新しい機能セクションを追加 or 既存セクションを更新
   - 最終更新日を更新
   - 関連する FAQ を追加 (どう使うかの 1-2 行)

2. **`app/mochi-settings/page.tsx` の `CAPABILITIES` 定数**
   - 非エンジニアが読んでわかる言葉で機能を 1 カード追加
   - カテゴリ (日常のサポート / 記憶と思い出し / メモ・リスト管理 / 外部に頼む / etc) のどれに入れるか判断
   - 必ず `examples` (こう話しかけてみて) を 2-3 例つける

3. **もちの system prompt** (`couple_settings.mochi_prompt` テーブル)
   - 新 tool は「重要なルール」セクションに 1 行追加 (いつ呼ぶか・何をするか)
   - 必要があれば専用セクション (例: 「=== ご飯の提案フロー ===」) を追加
   - 更新は `scripts/update-mochi-prompt-*.mjs` を作って実行 (idempotent に書く)

### チェックリスト (作業終了前)

- [ ] APP_SPEC.md を更新したか
- [ ] mochi-settings の CAPABILITIES に追加したか
- [ ] system prompt を更新したか (tool の場合)
- [ ] tool 定義 (`mochiTools` in `app/api/mochi/route.ts`) を追加したか
- [ ] 実行ハンドラ (`executeFunctionCall` or `executeDataFunction`) を追加したか
- [ ] 型チェック (`npx tsc --noEmit`) が通るか
- [ ] dev server で `/memos`, `/chat`, `/mochi-settings` が 200 を返すか

このルールに違反すると「実装はあるけどユーザーは存在を知らない」「仕様書と実態がズレる」
という二重メンテ地獄になる。必ず同時更新すること。

---

## 3. DB マイグレーション

- マイグレーションスクリプトは `scripts/` 配下に置く
- 命名: `add-<feature>.mjs` (例: `add-memos-position.mjs`)
- **必ず idempotent に書く** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING` などを活用)
- Supabase CLI のキーチェーン認証を使うパターン (既存スクリプト参照)
- スクリプト末尾で結果確認 SQL を実行して `console.table` で表示

---

## 4. 設計の指針

### tool 追加の判断基準

「もち単独で完結する DB 操作 / データ取得」は基本的に tool 化する。
LLM の指示だけに頼ると以下のリスクが出る:
- 動作がブレる (LLM 任せ)
- ロジックを増やせない (天気 API 連動、過去履歴、構造化計算 など)
- 結果のログを残せない

tool 化のメリット:
- サーバ側コードで挙動を固定できる
- 構造化された context を LLM に渡せる
- 他のエンドポイント (cron, 別 UI) からも再利用できる

### tool の分類

1. **記憶系** (`update_*`): 黙って実行、返り値 null
2. **アクション系** (`add_*`, `delete_*`): 定型メッセージをチャットに投稿
3. **データ取得・委譲系** (`search_*`, `suggest_*`, `hub_*`): functionResponse で LLM に返し、自然言語で応答してもらう

### スコープ

- 個人プロジェクト・MVP 志向。over-engineering 禁止
- enterprise 系の機能 (認証、監査ログ、複数組織サポート) は不要
- ライブラリ追加は必要最小限。代替手段があるなら native 優先

---

## 5. 参考: 主要ファイル

- `app/api/mochi/route.ts` — もちの API エンドポイント。tool 定義・実行・LLM 呼び出し
- `app/mochi-settings/page.tsx` — もちの設定 UI (できること、キャラ設定、ユーザー情報、関係性、サマリー、ログ)
- `app/memos/page.tsx` — メモ画面
- `APP_SPEC.md` — 仕様書 (LLM の system prompt にも組み込まれる)
- `scripts/` — DB マイグレーション・バッチ
- `db_setup_*.mjs` — 初期スキーマ定義 (新規 DB 構築時に使う)
