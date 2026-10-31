# 共通QRからの在庫操作

- 共通URL: https://team-shift-app.vercel.app/#inventory-access
- アプリの「在庫管理 → 在庫一覧 → 共通QRコード・在庫操作リンク」でQR表示、SVG保存、リンクコピーができます。
- QR画像は静的ファイルで、外部QR生成サービスへ情報を送信しません。
- Google IDトークンをサーバーで署名・audience・メール確認済みの条件を検証します。会社ドメイン（正確に @plandosee.co.jp）または現在の登録メンバーだけを許可します。閲覧専用は変更できません。
- 在庫専用セッションは8時間、Secure/HttpOnly/SameSite=Strict Cookieです。毎回登録状態を再確認します。外部メンバーの削除は次の操作から反映します。
- 専用画面はタスク・メンバー一覧を取得しません。APIの応答は商品検索に必要な在庫項目に限定します。商品登録・削除やタスク操作は提供しません。
- 入出庫は最新在庫に対するFirestoreの競合検出つき更新を使います。負数の在庫を拒否し、リクエストIDで同一操作の再送を重複反映しません。
- 既存 inventoryMovements に操作人（Google確認済み）、メール、時刻、増減数、変更前後を保存します。
- 既存の FIREBASE_SERVICE_ACCOUNT_JSON、REPORT_AUTH_SECRET、GOOGLE_CLIENT_SECRET を使用します。Google OAuth クライアントは既存アプリと同一です。
- セッションが切れたらGoogleログインし直します。Googleアカウント情報はlocalStorageへ保存しません。
