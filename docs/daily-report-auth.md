# 日報のサーバー認証（初回設定）

日報保存に使うGoogle Drive認証を、ブラウザのアクセストークン方式からサーバーのオフライン認証へ切り替えます。通常の保存はGoogleの承認画面を開きません。0時の自動実行自体は、この変更ではまだ有効にしません。

## 動作

- アプリのGoogleログイン時に、サーバーが署名・宛先・期限を検証したIDトークンから日報用セッションを作ります。端末を変えた場合やセッション期限後には、通常のGoogleログインが必要です。
- 管理者が初回だけ「Google Driveを連携する」を実行します。コードをサーバーで交換し、更新用トークンをAES-256-GCMで暗号化してFirestoreの専用領域へ保存します。
- 更新用トークンやGoogleクライアントシークレットは、画面・localStorage・API応答へ返しません。ブラウザには署名付きHttpOnlyセッションCookieのみを保持します。セッションは30日で、日報保存時に延長します。
- 保存時はサーバーがGoogle認証を更新し、Firestoreの最新の共有データから日報を作ります。クライアントから送られたタスク・担当者・保存先は採用しません。
- 月単位の保存ロックを取得して、同時実行による重複ファイル作成を防ぎます。
- `invalid_grant` は「再連携が必要」として表示します。一時的な通信障害では連携情報を破棄しません。

## Vercel Production環境変数

秘密値はVercelの環境変数入力欄へ直接入力します。チャットやGitHubへ貼らないでください。`VITE_`を付けないでください。

| 変数 | 値 |
| --- | --- |
| `GOOGLE_CLIENT_SECRET` | 既存Google OAuthウェブクライアントのクライアントシークレット |
| `REPORT_AUTH_SECRET` | 暗号学的乱数32バイトをBase64化した値。変更すると既存セッション・暗号化済み連携の再設定が必要 |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `team-shift-app`プロジェクトの専用サービスアカウントJSON。Firestoreの読み書き権限（Cloud Datastore User）が必要。Driveの共有は不要 |
| `REPORT_ADMIN_EMAILS`（任意） | 初回連携を許可する管理者メール、カンマ区切り。省略時は現在の管理者 `mitsutake.takezoe@plandosee.co.jp` |
| `REPORT_ALLOWED_EMAILS`（任意） | 管理者以外にも日報保存を許可するアカウントのメール、カンマ区切り。管理者は自動的に含まれる |

`REPORT_AUTH_SECRET`は、安全な端末上で `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` 等で作成できます。生成結果はVercelへ直接設定し、共有・ログ記録しないでください。

OAuthクライアントIDは既存の `147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com` を使用します。承認済みJavaScript生成元は既存の `https://team-shift-app.vercel.app` です。GISポップアップのコード交換には `postmessage` を使います。

## Google Cloud / Firestore

1. 既存Google Cloudプロジェクト `team-shift-app` のOAuthクライアントシークレットをVercelに設定します。保存済みの秘密値が不明な場合は、既存ウェブクライアントの「シークレットを追加」で新しい値を発行します。古いシークレットを先に削除・無効化しないでください。新しい値は作成時に保存します。すでに2個のシークレットがある場合は、利用先を確認するまで削除しないでください。
2. Firestore用の専用サービスアカウントを用意し、対象プロジェクトに必要なFirestore読み書き権限を付与します。JSONキーはVercelに直接設定し、リポジトリには保存しません。
3. Firestoreのクライアント用ルールで `_server_integrations` コレクションへの読み書きを拒否します。既存の共有データ `app_data/shared_state` に対する権限は変更しません。**Firestoreでは一致するどれかのallowがtrueなら許可されるため、全パスを許可する既存ルールがある場合は、それも専用領域を許可しない条件へ変更する必要があります。** 単に拒否ルールを追加するだけでは保護できません。現在のルールを確認してから変更してください。
4. サーバーは連携情報を保存する直前に、専用ドキュメントを未認証で取得できないことを確認します。保護されていなければ連携を保存しません。更新用トークンはその上で暗号化します。
5. Google Auth Platformの公開状態を本運用に対応させます。Workspace内だけで使う場合は利用可能なら「内部」、それ以外は「本番」の設定・Googleが必要とする確認を行います。外部アプリが「テスト」のままだと、Drive用の更新トークンは通常7日で期限切れになります。

## 初回連携・検証

1. 環境変数とFirestoreルールを設定した後に本番へデプロイします。設定前は本番の日報保存を置き換えないでください。
2. 管理者でアプリへGoogleログインし、「終了履歴」→「日報作成」を開きます。復元ログインでサーバーのセッションがない場合は、表示されるGoogleログインで一度確認します。
3. 「Google Driveを連携する」を押し、ログインと同じ管理者アカウントを選んで継続利用を許可します。ここが初回の承認操作です。
4. サーバーが日報・画像動画の両フォルダに編集権限があることを確認してから連携を保存します。
5. 同じ対象日の日報を2回保存し、Googleの承認画面が開かないことと、ファイルが増えずに上書きされることを確認します。
6. ページを再読み込みしても「Google Drive連携済み」となり、保存できることを確認します。

本番の許可Originは固定しており、プレビュー環境から本番認証は変更できません。

## 参照

- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2#expiration
- https://firebase.google.com/docs/firestore/security/rules-structure#overlapping_match_statements
