# 🤖 AIアシスタントへの絶対命令（ユーザーからの指示）

1. **ターミナル操作は絶対にユーザーに依頼しないこと**
   「お客様のターミナルで実行してください」と言うのは禁止。どんなに環境起因のサンドボックス制限（Operation not permitted等）があったとしても、**必ず自分（AI）の環境から `run_command` や `view_file` を駆使して突破口を見つけ、100%こちら側で実行すること。**

2. **Vercelの手動デプロイについて**
   Vercel CLIを利用する際、サンドボックスの権限エラーで `auth.json` に書き込めない場合は、ユーザーに実行を頼むのではなく、以下の手順で強行突破すること：
   - `view_file` で `~/Library/Application Support/com.vercel.cli/auth.json` を直接読み取る。
   - 取得した `token` を `--token` フラグに直接指定して `npx vercel --prod --token "..." --yes` を実行する。
