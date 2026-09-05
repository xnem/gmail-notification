/**
 * ============================================================
 * Gmail 通知スクリプト（LINE / Pushover 連携）
 * ============================================================
 *
 * ■ このスクリプトは何をするもの?
 * 指定した送信元からのメールがGmailに届いていないかを定期的にチェックし、
 * 「未読の新着メール」を見つけたら、その内容を
 *   ① LINE公式アカウント経由でメッセージ通知
 *   ② Pushover経由で（サイレント設定でも鳴る）プッシュ通知
 * の両方で知らせてくれるツールです。
 *
 * 「重要な連絡メールを見逃したくない」「スマホがマナーモードでも
 * 絶対に気づきたい」といった用途を想定しています。
 *
 * ■ 使い始める前に必要な準備（3つ）
 *
 * 1. LINE公式アカウントを作成し、Messaging APIを有効化する
 *    → チャンネルアクセストークンと、通知を送りたい相手のユーザーIDを取得します。
 *    参考: https://note.shiftinc.jp/n/n84f89cb03637
 *
 * 2. Pushoverのアカウントを作成し、アプリを登録する
 *    → ユーザーキーとアプリトークンを取得します。
 *    参考: https://qiita.com/sense_of_unity/items/a977fc1d97ccf9e89e39
 *    ※Pushoverは有料ライセンス制です（購入前に1か月間の無料お試し期間があります）。
 *      期間終了後も使い続けるには購入が必要です。
 *
 * 3. このスクリプトを「定期的に自動実行」させるための設定をする
 *    → このコード自体には自動実行の仕組みは含まれていません。
 *      Apps Scriptエディタの左メニューにある「トリガー」から、
 *      execute関数を「時間主導型」（例: 5分おき）で実行するように
 *      登録してください。この設定を忘れると、スクリプトはずっと
 *      動かないままになるので注意してください。
 *
 * ■ 使い方
 * 下にある3つの設定（COMMON_CONFIG, LINE_CONFIG, PUSHOVER_CONFIG）の
 * 値を、ご自身の環境に合わせて書き換えてから保存してください。
 * {{ }}で囲まれている部分は、必ずご自身の値に置き換える必要がある
 * プレースホルダー（仮の値）です。
 */

const COMMON_CONFIG = {
  // 通知したいメールの「送信元アドレス」を指定します。
  // 例: 'from:info@example.com'
  // このアドレスから届いたメールだけが通知の対象になります。
  // （{{SENDER_MAIL_ADDRESS}}の部分を実際のメールアドレスに書き換えてください）
  SENDER_MAIL_ADDRESS: 'from:{{SENDER_MAIL_ADDRESS}}',

  // メールの件名にこれらの文字列が含まれていた場合、
  // そのメールは「テスト用」とみなして通知をスキップします。
  // 必要であれば、ここに無視したい単語を自由に追加できます。
  // 例: ['test', 'テスト', '広告']
  IGNORE_STRINGS: ['test', 'テスト'],
}

const LINE_CONFIG = {
  // LINE Messaging APIの送信先URLです。通常は変更不要です。
  API_URL: 'https://api.line.me/v2/bot/message/push',

  // LINE Developersコンソールで発行される「チャンネルアクセストークン」です。
  // LINE公式アカウントの管理画面 → Messaging API設定 から発行・確認できます。
  // 第三者に知られると勝手にメッセージを送信されてしまうため、
  // このファイルを他人と共有する際は書き換え忘れに注意してください。
  CHANNEL_ACCESS_TOKEN: '{{YOUR_TOKEN}}',

  // 通知を受け取りたい人（自分）のLINEユーザーIDです。
  // LINE公式アカウントを友だち追加した状態で、Webhookのログなどから
  // 確認できます（Messaging APIのドキュメントを参照してください）。
  USER_ID: '{{YOUR_ID}}',
}

const PUSHOVER_CONFIG = {
  // Pushover APIの送信先URLです。通常は変更不要です。
  API_URL: 'https://api.pushover.net/1/messages.json',

  // Pushoverの「ユーザーキー」です。Pushoverにログイン後、
  // トップページに表示されている英数字の文字列です。
  USER_KEY: '{{YOUR_KEY}}',

  // Pushoverで作成した「アプリケーション」に紐づくトークンです。
  // https://pushover.net/apps/build からアプリを登録すると発行されます。
  APPLICATION_TOKEN: '{{YOUR_TOKEN}}',

  // 通知画面に表示されるタイトルです。自由に変更してください。
  // 例: '新着メール通知'
  TITLE: 'タイトル',

  // 通知本文です。自由に変更してください。
  // 例: 'メールが届いています。ご確認ください。'
  MESSAGE: 'メッセージです。',

  // 「緊急通知（Emergency Priority）」を、確認するまで何秒おきに
  // 再送し続けるかの間隔です。Pushoverの仕様上、30秒より短くはできません。
  // 数値を大きくするほど、通知の間隔が空きます。
  RETRY_SECONDS: 60,

  // 緊急通知を最大で何秒間鳴らし続けるかです。
  // ここで指定した秒数が経過すると、確認していなくても再送は止まります。
  // Pushoverの仕様上、10800秒（3時間）が上限です。
  EXPIRE_SECONDS: 300,

  // 通知音の種類です。Pushoverが用意している音の中から選べます。
  // 選べる音の一覧: https://pushover.net/api#sounds
  SOUND: 'echo',
}

/**
 * メイン処理。
 * このexecute関数を「時間主導型トリガー」に登録することで、
 * 定期的に新着メールをチェックできるようになります。
 * （トリガーの設定方法は、Apps Scriptエディタ左メニューの
 *  「トリガー」アイコンから行えます）
 */
function execute() {
  // 前回の実行がまだ終わっていない場合、同じ未読メールを二重に
  // 通知してしまわないよう、ロックが取れなければ何もせず終了します。
  // （このメールは既読にしないので、今回見送っても次回のトリガーで
  //  改めて検知・通知されます）
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('前回の実行がまだ終わっていないため、今回はスキップします。');
    return;
  }

  try {
    // 指定した送信元アドレスに一致するメールのスレッドを、
    // 新しいものから最大10件取得します。
    const threads = GmailApp.search(COMMON_CONFIG.SENDER_MAIL_ADDRESS, 0, 10);

    // 該当するメールが1件も無ければ、ここで処理を終了します。
    if (threads.length === 0) {
      return;
    }

    threads.forEach(thread => {
      // スレッド内の各メールを取得します。
      const messages = GmailApp.getMessagesForThread(thread);

      for (let i = 0; i < messages.length; i++) { // forEach文だとcontinueが使えないのでfor文
        const message = messages[i];

        // すでに読んだメール（既読）は通知の対象外にします。
        // これにより、同じメールで何度も通知が来ることを防いでいます。
        if (message.isUnread()) {
          const subject = message.getSubject();

          // 件名に「無視したい文字列」が含まれていないかチェックします。
          // 含まれていれば、このメールへの通知はスキップします。
          let isInclude = false;
          for (let l = 0; l < COMMON_CONFIG.IGNORE_STRINGS.length; l++){
            if (subject.includes(COMMON_CONFIG.IGNORE_STRINGS[l])) {
              isInclude = true;
              break;
            }
          }
          if (isInclude) {
            continue;
          }

          const date = message.getDate();
          // 本文が長すぎるとLINEメッセージとして送りにくいため、
          // 先頭から500文字だけを取り出しています。
          let contents = message.getPlainBody().slice(0, 500);

          // 本文中の空白行（改行だけの行）を取り除き、見やすく整えます。
          contents = removeEmptyLines(contents);

          // LINEへメッセージを送信します。
          sendLine(date, subject, contents);

          // Pushoverへも通知を送ります（マナーモードでも鳴る緊急通知）。
          sendPushover();
        }
      }
    });
  } finally {
    // 次回以降の実行がロック待ちで詰まらないよう、必ず解放します。
    lock.releaseLock();
  }
}

/**
 * Pushoverへ緊急通知（Emergency Priority）を送信します。
 * マナーモードやサイレントモードの端末でも音が鳴るのが特徴です。
 * 通知を確認する（アプリ上でACKする）までRETRY_SECONDSごとに再送され、
 * EXPIRE_SECONDSが経過すると再送を停止します。
 */
function sendPushover() {
  const payload = {
    token: PUSHOVER_CONFIG.APPLICATION_TOKEN,
    user: PUSHOVER_CONFIG.USER_KEY,
    title: PUSHOVER_CONFIG.TITLE,
    message: PUSHOVER_CONFIG.MESSAGE,
    priority: '2', // 2は「Emergency Priority（緊急）」を意味し、消音状態でも音が鳴ります
    retry: PUSHOVER_CONFIG.RETRY_SECONDS,
    expire: PUSHOVER_CONFIG.EXPIRE_SECONDS,
    sound: PUSHOVER_CONFIG.SOUND,
  };

  const options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true, // エラー時もスクリプトを止めず、レスポンス内容をログで確認できるようにする設定
  };

  callApi(PUSHOVER_CONFIG.API_URL, options);
}

/**
 * LINEへメッセージを送信します。
 * 「日時・件名・本文」をつなげた1通のテキストメッセージとして送られます。
 *
 * @param {Date} date メールの受信日時
 * @param {string} subject メールの件名
 * @param {string} contents メール本文（先頭500文字・空白行を除いたもの）
 */
function sendLine(date, subject, contents) {
  // 本文が空っぽの場合は、空のメッセージを送らないようにスキップします。
  if (contents.trim() === '') {
    Logger.log('メッセージが空です。LINEへの送信をスキップします。');
    return;
  }

  const message = date + "\n" + subject + "\n\n" + contents;

  const headers = {
    'Content-Type': 'application/json',
    // LINE Messaging APIの認証には、チャンネルアクセストークンを
    // 「Bearer トークン」の形式でヘッダーに付与する必要があります。
    'Authorization': 'Bearer ' + LINE_CONFIG.CHANNEL_ACCESS_TOKEN
  };

  const payload = {
    'to': LINE_CONFIG.USER_ID,
    'messages': [
      {
        'type': 'text',
        'text': message
      }
    ]
  };

  const options = {
    'method': 'post',
    'headers': headers,
    'payload': JSON.stringify(payload)
  };

  callApi(LINE_CONFIG.API_URL, options);
}

/**
 * 文字列内の「中身が空の行（改行のみの行）」を取り除きます。
 * メール本文をそのまま通知に使うと、余計な空行が目立つことがあるための処理です。
 *
 * @param {string} str 整形前の文字列
 * @return {string} 空行を除いた文字列
 */
function removeEmptyLines(str) {
  return str.split('\n').filter(line => line.trim() !== '').join('\n');
}

/**
 * 指定したURLへ、HTTPリクエストを送信する共通処理です。
 * LINE・Pushoverどちらの送信でも、最終的にはこの関数を通じて
 * 実際の通信が行われます。
 *
 * 通信が失敗した場合でもスクリプト全体は止まらず、
 * エラー内容が実行ログ（表示 → 実行数／ログ）に記録されるだけになります。
 * うまく通知が届かないときは、まずこのログを確認してください。
 *
 * @param {string} url 送信先のAPI URL
 * @param {object} options UrlFetchAppに渡すリクエストの設定内容
 */
function callApi(url, options) {
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    if (responseCode >= 200 && responseCode < 300) {
      Logger.log('API実行に成功しました。レスポンス: ' + response.getContentText());
    } else {
      Logger.log('APIがエラーを返しました。ステータスコード: ' + responseCode + ' レスポンス: ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('API実行中にエラーが発生しました: ' + error);
  }
}