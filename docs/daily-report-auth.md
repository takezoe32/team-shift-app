# 日報のサーバー認証（初回設定）

日報保存に使うGoogle Drive認証を、ブラウザのアクセストークン方式からサーバーのオフライン認証へ切り替えます。管理者が初回に連携を許可すると、通常の保存はGoogleの承認画面を開きません。Vercel Cronが毎日、日本時間の午前0時に前日分だけを保存します。ブラウザの起動やメンバーの操作は不要です。

現在のHobbyプランでは実際の実行時刻は午前0:00〜0:59の間です。分単位の定刻実行は保証されません。

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
| `CRON_SECRET` | 定期実行専用のランダムな秘密文字列。Productionに設定する。GoogleのシークレットやREPORT_AUTH_SECRETとは別の値を使う。未設定・不一致の場合、定期実行APIは保存しない |
| `REPORT_ADMIN_EMAILS`（任意） | 初回連携を許可する管理者メール、カンマ区切り。省略時は現在の管理者 `mitsutake.takezoe@plandosee.co.jp` |
| `REPORT_ALLOWED_EMAILS`（任意） | 管理者以外にも日報保存を許可するアカウントのメール、カンマ区切り。管理者は自動的に含まれる |

`REPORT_AUTH_SECRET`は、安全な端末上で `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` 等で作成できます。生成結果はVercelへ直接設定し、共有・ログ記録しないでください。

OAuthクライアントIDは既存の `147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com` を使用します。承認済みJavaScript生成元は既存の `https://team-shift-app.vercel.app` です。GISポップアップのコード交換には `postmessage` を使います。

## Google Cloud / Firestore

1. 既存Google Cloudプロジェクト `team-shift-app` のOAuthクライアントシークレットをVercelに設定します。保存済みの秘密値が不明な場合は、既存ウェブクライアントの「シークレットを追加」で新しい値を発行します。古いシークレットを先に削除・無効化しないでください。新しい値は作成時に保存します。すでに2個のシークレットがある場合は、利用先を確認するまで削除しないでください。
2. Firestore用の専用サービスアカウントを用意し、対象プロジェクトに必要なFirestore読み書き権限を付与します。JSONキーはVercelに直接設定し、リポジトリには保存しません。
3. Firestoreのクライアント用ルールで `_server_integrations` コレクションへの読み書きを拒否します。既存の共有データ `app_data/shared_state` に対する権限は変更しません。**Firestoreでは一致するどれかのallowがtrueなら許可されるため、全パスを許可する既存ルールがある場合は、それも専用領域を許可しない条件へ変更する必要があります。** 単に拒否ルールを追加するだけでは保護できません。現在のルールを確認してから変更してください。
4. サーバーは連携情報を保存する直前に、専用ドキュメントを未認証で取得できないことを確認します。保護されていなければ連携を保存しません。更新用トークンはその上で暗号化します。
5. Google Auth Platformの公開状態を本運用に対応させます。外部アプリが「テスト」のままだと、Drive用の更新トークンは通常7日で期限切れになります。公開ステータスとGoogleのブランド・スコープ検証は別です。検証の要否は利用者・用途・要求スコープとGoogleの適用条件に従って判断します。アプリの改修権限やCron実行権限を、他メンバーへ渡す必要はありません。

## 初回連携・検証

1. 環境変数とFirestoreルールを設定した後に本番へデプロイします。設定前は本番の日報保存を置き換えないでください。
2. 管理者でアプリへGoogleログインし、「終了履歴」→「日報作成」を開きます。復元ログインでサーバーのセッションがない場合は、表示されるGoogleログインで一度確認します。
3. 「Google Driveを連携する」を押し、ログインと同じ管理者アカウントを選んで継続利用を許可します。ここが初回の承認操作です。
4. サーバーが日報・画像動画の両フォルダに編集権限があることを確認してから連携を保存します。
5. 同じ対象日の日報を2回保存し、Googleの承認画面が開かないことと、ファイルが増えずに上書きされることを確認します。
6. ページを再読み込みしても「Google Drive連携済み」となり、保存できることを確認します。

本番の許可Originは固定しており、プレビュー環境から本番認証は変更できません。

## 毎日の自動保存

- `vercel.json` の `0 15 * * *` はUTC指定で、日本時間の翌日午前0時に対応します。Hobbyでは0時台の実行です。
- 本番の `/api/daily-report-cron` がVercelから呼ばれます。VercelはProductionの `CRON_SECRET` をBearer認証で送信します。Cookieや手動ログインは使いません。プレビューや未認証の呼び出しは拒否します。
- 対象日はサーバーで日本時間の前日を計算します。URL・リクエストの指定日で変更できません。例：10月16日午前0時台なら10月15日分だけ。過去の未作成日をまとめて作成しません。
- 保存は手動と共通のサーバー処理、最新共有データ、固定のDrive保存先、月単位ロックを使います。アプリで入力済みの天候・塩素・備考は、自動保存で上書きしません。初回作成時に手入力されていない項目は空欄です。
- 成功後に `_server_integrations/report_auto_YYYY-MM-DD` にファイルIDと完了時刻を記録します。重複呼び出しはロック内で完了記録を確認し、保存済みならスキップします。手動再作成は引き続き可能です。
- 保存途中の失敗・完了記録の書き込み失敗では完了扱いにしません。再実行時は既存の月次ファイルを更新します。既存ファイルを新たに複製しません。
- Vercelには失敗したCronの自動再試行保証がありません。ログの `daily-report-cron` イベントで対象日とsaved/skipped/failedを確認します。失敗日は手動保存で回復してください。翌日のCronはその時点の前日分だけが対象です。
- Googleの許可取り消し・トークン失効・Drive容量不足・サービス停止時は保存が失敗する場合があります。初回許可後に毎日承認を求める仕組みではありませんが、許可取り消し等があれば管理者の再連携が必要です。

## 本番反映の手順

1. 既存の3秘密値とFirestore保護、サービスアカウント権限、管理者の両Driveフォルダへの追加権限を確認します。
2. 新しい `CRON_SECRET` をProductionへSecretとして追加します。32バイトのランダム値をBase64化した文字列を利用できます。チャットへ値を貼りません。
3. PRをmainへ反映し、Productionデプロイの成功とSettings → Cron Jobsの登録を確認します。初回Drive連携が済むまでは自動保存は成功しません。
4. 管理者がアプリで一度だけGoogle Drive連携を完了し、まず手動保存で内容を確認します。
5. Cron JobsのRunを使う場合、実際に日本時間の前日分を作成・更新します。未来日や任意の過去日を指定するテスト機能ではありません。
6. 初回の自動実行後、Vercelログ、完了記録、Drive上の前日分シートを確認します。単にCronが登録されたことだけで保存成功とは判断しません。
7. 停止する場合はVercel Settings → Cron JobsでDisableにするか、設定からcronを削除して再デプロイします。Googleの更新用トークンや秘密鍵を停止のために削除する必要はありません。

参考：
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/cron-jobs/manage-cron-jobs

## 参照

- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2#expiration
- https://firebase.google.com/docs/firestore/security/rules-structure#overlapping_match_statements
