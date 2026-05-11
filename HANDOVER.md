# 次回セッション引き継ぎ書

> 最終更新: 2026-05-11
> 前セッション: Claude Opus 4.7（1M context）

---

## 🔴 最優先課題：スタンプを送ると送信者の画面で2回表示されるバグ

### 現象（再現）

1. 送信者がスタンプを送る
2. 送信者の画面で**同じスタンプが2つ縦に並んで表示される**
3. 受信者の画面では1つだけ
4. 送信者の画面をリロードすると1つに戻る

### これまで何度か修正を試みたが解決していない

直近の修正コミット `e69c81d` でtemp置換ロジックを厳密化したが**ユーザー報告でまだ直っていない**。

```
fix(chat): stamp duplication + reactions on all messages + large emoji
↓
ユーザー「2.3.OK 1がだめだな」
```

### 既に試した修正（時系列）

| コミット | 修正内容 | 結果 |
|----------|----------|------|
| `1cfe23c` | temp置換条件を「user_id + text一致 or 両方画像」に緩和 + 3秒fallback | ❌ |
| `e69c81d` | text exact / 同一スタンプURL / blob→https のみマッチ | ❌（現状） |

### 多角的に調査すべき仮説

**思い込みを捨てて、以下を全て検証してから修正に入ること。**

#### 仮説A: temp置換ロジックは複数箇所にある（最有力）

`app/chat/page.tsx` 内に temp 置換ロジックが **少なくとも4箇所** ある（grep で確認済み）：

```
line 390  : メインのRealtime INSERT ハンドラ
line 447  : 別のINSERT/UPDATE処理 (要確認、何のためか不明)
line 488  : さらに別のINSERT処理
line 731  : 送信フォールバック (3秒後の手動置換 or fetch後の置換)
```

これらが**同じINSERTイベントに対して別々の判定基準で処理し、片方は置換成功・片方は失敗 → 結果として「INSERTから生成したmsg」+「残ったtemp」の2つになる**可能性が高い。

**調査手順**:
1. `grep -n "tempIdx\|withoutTemp\|prev.filter.*temp_" app/chat/page.tsx` で全箇所を列挙
2. 各箇所が「いつ」「どの条件で」発火するか把握する
3. 4箇所のロジックを統一する（ヘルパー関数1つに集約）

#### 仮説B: Realtime INSERT が2回届く

Supabase Realtime が同一INSERTイベントを2回配信する既知のバグや、複数チャンネル購読の重複の可能性。

**調査手順**:
1. `console.log` をINSERTハンドラに仕込み、本番で2回呼ばれていないか観察
2. `supabase.channel('chat-messages')` が複数回作られていないか確認（useEffectの依存配列・StrictMode）
3. Next.js App Router の React Strict Mode 二重実行の影響を確認

#### 仮説C: tempメッセージが時刻順ソートの罠で2つに見える

メッセージ配列は `timestamp` で並び替えている可能性。temp と本物の `timestamp` が微妙に異なるため、置換後も両方残って隣接表示される。

**調査手順**:
1. `setMessages(prev => ...)` の更新で、置換後の配列をソートしているか確認
2. tempの `timestamp: Date.now()` と DBの `created_at` の差で順序が崩れていないか

#### 仮説D: 送信フォールバックが温存しすぎている

直近修正で `setTimeout(..., 3000)` の「3秒後にtempを送信済みに変える」ロジックを追加した。これは**RealtimeでINSERTが届いてtempが削除された後**も発火し、新しく加わったDBメッセージを上書きしてtempを復活させている可能性。

**調査手順**:
1. `sendStamp` 周りに3秒フォールバックがあるか確認
2. あれば、そのtempIdをトラッキングして「既に消えていればスキップ」する

#### 仮説E: 楽観的UIのtempが「画像URLがstamps/...」なので、Realtimeで来る本物と完全一致して両方残る

```ts
sendStamp:
  temp.imageUrl = `/stamps/stamp_X.png`  ← ローカルパス
DB INSERT:
  newMsg.image_url = `/stamps/stamp_X.png`  ← 同じパス（Supabase Storageではなくpublic配信）
```

現在の置換ロジックは「同一URL一致なら置換」だが、**この条件で findIndex が動いていない**可能性。

**調査手順**:
1. ブラウザDevToolsで `console.log` を仕込み、`m.imageUrl` と `newMsg.image_url` の生値を比較
2. trailing slashや大文字小文字の違いがないか確認

---

### 次回の進め方（厳守）

1. **コードを修正する前に、必ず本番 or ローカルで `console.log` を仕込んで現象を観察**
2. 「temp置換ロジックは何箇所あって、それぞれ何のためか」を**全部把握してから**修正
3. 4箇所のロジックを**1つのヘルパー関数に統合**して、判定基準を一元化
4. **修正前に「現状のINSERT INSERT INSERTがどう発火しているか」のフロー図をテキストで書く**こと

---

## 📦 プロジェクト概要

- **アプリ**: BOSHI×BOSHI Talk（ミルク・メリーの2人専用カップルチャットアプリ）
- **スタック**: Next.js 16 (App Router, Turbopack), React 19, Supabase, Gemini 2.5 Flash, Web Push
- **デプロイ**: Vercel（`vibe-chat-app-ivory.vercel.app`）
- **リポジトリ**: `github.com/ichiro0712-dotcom/bosi-bosi-talk`
- **メインブランチ**: `main`
- **作業ディレクトリ**: `/Users/kawashimaichirou/Desktop/バイブコーディング/チャットアプリ`

### 主要ファイル

| ファイル | 用途 |
|---------|------|
| `app/chat/page.tsx` | チャット画面（1300行近い巨大ファイル、リファクタ余地大） |
| `app/api/mochi/route.ts` | もちAI APIエンドポイント（Function Calling搭載） |
| `app/api/cron-mochi/route.ts` | もちの定期挨拶（朝・月曜） |
| `app/api/notify/route.ts` | Web Push通知 |
| `app/components/PushSubscriber.tsx` | layoutから全ページでsubscription更新 |
| `app/todos/page.tsx` | TODO/リマインダー統合ページ |
| `app/memos/page.tsx` | 共有メモ |
| `app/mochi-settings/page.tsx` | もちのキャラ・プロファイル設定 |
| `APP_SPEC.md` | アプリ仕様書（もちのSystem Promptに注入される） |

### 主要DBテーブル（Supabase）

- `messages` - チャットメッセージ（is_read, reply_to, is_deleted, deleted_at, announcement カラムあり）
- `message_reactions` - リアクション（最近作成された：id, message_id, user_id, reaction_id, UNIQUE）
- `todos` - タスク（親子階層、status, assignee, due_date, description, mochi_reminders）
- `memos` - 共有メモ
- `subscriptions` - Web Push subscription
- `couple_settings` - 記念日、もちプロンプト
- `scheduled_reminders` - リマインダー
- `announcements` - チャットのピン留め
- `mochi_user_profiles` - もちが記憶するミルク/メリーの情報（7カテゴリ）
- `mochi_relationship` - 2人の関係性Vibe
- `mochi_conversation_summaries` - 会話サマリー（中期記憶）
- `mochi_memory_log` - もちの自律記憶更新ログ

### Realtime publication 登録済み

- `messages`
- `todos`
- `message_reactions`（直近追加）

### Supabase接続方法

**SQL直接実行（管理用）**：

```bash
# トークンはmacOS Keychainから取得（base64エンコード済み）
TOKEN_B64=$(security find-generic-password -s "Supabase CLI" -a "supabase" -w)
TOKEN=$(echo "$TOKEN_B64" | sed 's/go-keyring-base64://' | base64 -d)
REF="pxvqxcbqfxpeashgnvjx"

curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 1;"}'
```

Supabase CLI が `supabase login` 済みで、トークンは Keychain に保存されている。

### 環境変数（Vercel）

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     ← 22h前(2026-04頃)追加。最新デプロイで反映済み
GEMINI_API_KEY
VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_SUBJECT
CRON_SECRET                    ← 設定されている場合のみcron認証チェック
```

ローカルの `.env.local` も同じキーが揃っている。`GEMINI_API_KEY` に `\n` が混入していた事故あり（修正済み）。

---

## 🔧 直近の重要修正履歴

| コミット | 内容 |
|----------|------|
| `e69c81d` | スタンプ重複（未解決）+ message_reactionsテーブル作成 + 絵文字単体大きく表示 |
| `418e3f0` | cron-mochi の文章途切れ修正（maxOutputTokens 600→4000、thinkingBudget:0、finishReason検出） |
| `329069d` | 複数画像同時アップロード対応、画像メッセージにも長押しメニュー |
| `2acb537` | もち設定の定型文拡張・UI改善 |
| `ea43090` | もち設定下部余白追加（フッターメニューとの被り解消） |
| `d029c74` | もちのTODO通知とアイコン更新 |
| `7ad...` | LINE準拠チャット（既読/長押し/リプライ/アナウンス/送信取消/削除） |
| `c28b380` | もちメモ作成のエラーチェック + SUPABASE_SERVICE_ROLE_KEY追加 |

---

## 🎵 音声通知（hook設定済み）

`~/.claude/settings.json` に以下のhookが設定されている:

- **応答完了 (Stop)** → `Hero.aiff`（ファンファーレ）
- **確認プロンプト (Notification / PermissionRequest)** → `Glass.aiff`（チリン）

全プロジェクト共通。

---

## ⚠️ 注意事項・地雷ポイント

1. **`app/chat/page.tsx` が1300行近い巨大ファイル**。手を入れるたびに別の場所が壊れる可能性大。リファクタを検討すべきだが、安易にやると更に壊れるリスクあり。

2. **temp置換ロジックが4箇所に散らばっている**（line 390, 447, 488, 731）。スタンプ重複バグの根本原因の可能性。**統合が必要**。

3. **Realtime + ポーリング + visibilitychange の3重保護**を入れている。これが意図せずINSERTを重複処理している可能性も検討すること。

4. **`messages.id` が `number | string`**（tempは`'temp_xxx'`文字列、DBはbigint）。条件分岐で型を間違えやすい。

5. **TypeScript target が `es5`** なので、Regex `u` フラグ等が使えない。`Intl.Segmenter` は実行時にあれば使える形式で実装している。

6. **画像URL**：
   - スタンプ: `/stamps/stamp_X.png`（publicフォルダ配信、tempもDBも同じURL）
   - ユーザーアップロード画像: tempは `blob:...`、DBは `https://...supabase.co/...`
   - **temp置換時はこの違いを意識する必要がある**

7. **もちは `user_id='mochi'`** で messages に保存される。auth.users とは紐づかないので RLS や FK 制約に注意。

8. **`message_reactions` テーブルは最近 (2026-05-11) 作成**。コードは前からあったがテーブルがなく全部失敗していた経歴。

---

## 🚀 セッション開始時のチェックリスト

1. `git pull origin main` で最新を取得
2. `git log --oneline -10` で直近の変更を確認
3. `npm run dev`（または既に走っているか確認）
4. `npx vercel ls` で本番デプロイ状況確認
5. 上記の「スタンプ重複バグ」を**仮説A〜Eを多角的に調査**してから修正開始

---

## 📋 未着手のタスク・要望（前セッションで保留）

特になし。スタンプ重複バグが片付き次第、ユーザーから次の指示を待つ。
