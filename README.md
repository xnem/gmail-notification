# gmail-notification

指定した送信元からの未読メールを定期的にチェックし、見つけたら **LINE** と **Pushover** の両方で通知する Google Apps Script（GAS）です。

「重要な連絡メールを見逃したくない」「スマホがマナーモードでも絶対に気づきたい」といった用途を想定しています。

## 特徴

- 指定した送信元アドレスからの新着メールを検知して通知
- 件名にキーワードが含まれるメール（テスト送信など）は通知をスキップ
- LINE公式アカウント経由でメール本文（先頭500文字）をテキスト通知
- Pushover経由で緊急通知（Emergency Priority）を送信し、サイレントモードでも鳴動
- 通知したメールは**あえて既読にしない**（詳細は[注意事項](#注意事項)を参照）
- `LockService` により多重実行を防止し、同じメールへの重複通知を回避

## ファイル構成

- [gmail_notification.gs](gmail_notification.gs) — 本体スクリプト（このファイルをGASプロジェクトに配置します）

## 事前準備

### 1. LINE公式アカウントの準備

LINE公式アカウントを作成し、Messaging APIを有効化して以下を取得します。

- チャンネルアクセストークン
- 通知を受け取りたい人（自分）のLINEユーザーID

参考: https://note.shiftinc.jp/n/n84f89cb03637

### 2. Pushoverの準備

Pushoverのアカウントを作成し、アプリを登録して以下を取得します。

- ユーザーキー
- アプリケーショントークン

参考: https://qiita.com/sense_of_unity/items/a977fc1d97ccf9e89e39

> [!NOTE]
> Pushoverは有料ライセンス制です（購入前に1か月間の無料お試し期間があります）。期間終了後も使い続けるには購入が必要です。

### 3. 定期実行トリガーの設定

このスクリプト自体には自動実行の仕組みは含まれていません。Apps Scriptエディタの左メニューの「トリガー」から、`execute` 関数を**時間主導型**（例: 5分おき）で実行するよう登録してください。この設定を忘れると、スクリプトはずっと動かないままになります。

## セットアップ手順

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成します。
2. [gmail_notification.gs](gmail_notification.gs) の内容をエディタに貼り付けます。
3. スクリプト冒頭にある3つの設定オブジェクトを、自分の環境に合わせて書き換えます（`{{ }}` で囲まれた箇所は必ず置き換えてください）。

   - `COMMON_CONFIG`
     - `SENDER_MAIL_ADDRESS`: 通知対象にしたい送信元メールアドレス（例: `'from:info@example.com'`）
     - `IGNORE_STRINGS`: 件名に含まれていたら通知をスキップする文字列の配列
   - `LINE_CONFIG`
     - `CHANNEL_ACCESS_TOKEN`: LINEのチャンネルアクセストークン
     - `USER_ID`: 通知を受け取るLINEユーザーID
   - `PUSHOVER_CONFIG`
     - `USER_KEY`: Pushoverのユーザーキー
     - `APPLICATION_TOKEN`: Pushoverのアプリケーショントークン
     - `TITLE` / `MESSAGE`: 通知に表示するタイトルと本文
     - `RETRY_SECONDS` / `EXPIRE_SECONDS` / `SOUND`: 緊急通知の再送間隔・持続時間・通知音

4. 保存後、初回のみ `execute` 関数を手動実行し、Gmail・LINE・Pushoverへのアクセス権限を承認します。
5. 「準備」の手順3に従い、`execute` 関数を時間主導型トリガーに登録します。

## 動作の流れ

1. `execute` がトリガーにより定期実行される。
2. `LockService` で多重実行をチェックし、前回の実行が終わっていなければ何もせず終了する。
3. `COMMON_CONFIG.SENDER_MAIL_ADDRESS` に一致するスレッドを最新10件取得する。
4. 各スレッド内の未読メールについて、件名に無視対象の文字列が含まれていないか確認する。
5. 対象メールが見つかったら、日時・件名・本文（先頭500文字、空行除去済み）をLINEへ送信し、続けてPushoverへ緊急通知を送信する。

## 注意事項

- **通知したメールは既読にしません。** これは仕様であり、次回以降のトリガー実行でも同じメールが検知対象になり続けます。既読管理はユーザー自身がGmail上で行ってください。
- `LINE_CONFIG.CHANNEL_ACCESS_TOKEN` などの認証情報は第三者に知られると悪用される可能性があります。スクリプトを共有する際は書き換え忘れに注意してください。
- API通信でエラーが発生してもスクリプト全体は停止せず、Apps Scriptの実行ログ（表示 → 実行数／ログ）にエラー内容が記録されます。通知が届かない場合はまずログを確認してください。
