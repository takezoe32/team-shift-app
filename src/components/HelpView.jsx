import { useState } from 'react';

function Steps({ items }) {
  return <ol className="space-y-3">{items.map((text, index) => <li key={text} className="flex gap-3 items-start"><span className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">{index + 1}</span><span className="text-base leading-relaxed pt-0.5">{text}</span></li>)}</ol>;
}
function Section({ id, title, children }) {
  return <section id={id} className="scroll-mt-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 space-y-4"><h2 className="text-xl sm:text-2xl font-bold text-blue-800">{title}</h2>{children}</section>;
}
function Note({ children }) {
  return <p className="rounded-xl bg-blue-50 p-4 text-base leading-relaxed text-gray-700">{children}</p>;
}

export default function HelpView({ currentUser }) {
  const [skip, setSkip] = useState(() => localStorage.getItem('teamshift_skip_help_on_login') === 'true');
  const isReportOwner = String(currentUser?.email || '').trim().toLowerCase() === 'mitsutake.takezoe@plandosee.co.jp';
  const topics = [['calendar', '予定を見る'], ['daily', '日別タスクを登録'], ['finish', 'タスクを終了'], ['partner', 'パートナーを登録'], ['schedule', '日程を変更'], ['handoff', '申し送りを追加'], ['history', '終了履歴を見る'], ['line', 'LINEから登録'], ['other', 'シフト・在庫・個人メモ']];
  return <div className="flex-1 overflow-y-auto bg-slate-50 pb-24 text-gray-800">
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="rounded-2xl bg-blue-600 text-white p-6 space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold">管理課アプリの使い方</h1>
        <p className="text-lg leading-relaxed">予定を確認する。作業を登録する。終わったら「終了」を押す。この流れで使います。</p>
        <label className="flex items-start gap-3 bg-white/15 rounded-xl p-4"><input type="checkbox" checked={skip} onChange={event => { setSkip(event.target.checked); localStorage.setItem('teamshift_skip_help_on_login', event.target.checked ? 'true' : 'false'); }} className="mt-1"/><span>次回ログイン時に、この使い方を最初に表示しない</span></label>
      </header>
      <Note>画面を移動するときは、一番下のメニューを押します。かんたん入力の画面でもメニューは使えます。入力途中の内容があるときは、移動前に確認が出ます。</Note>
      <nav aria-label="使い方の目次" className="grid grid-cols-2 gap-2">{topics.map(([id, title]) => <a key={id} href={`#help-${id}`} className="min-h-12 rounded-xl bg-white border border-blue-100 px-3 py-3 text-blue-800 font-bold">{title} ↓</a>)}{isReportOwner && <a href="#help-report" className="min-h-12 rounded-xl bg-white border border-blue-100 px-3 py-3 text-blue-800 font-bold">日報プレビュー ↓</a>}</nav>

      <Section id="help-calendar" title="予定を見る：カレンダー">
        <Steps items={['下の「カレンダー」を押します。', 'カレンダーで出勤・休みを確認します。見たい日付を押すと、その日の日別タスクを確認できます。過去の未終了タスクも表示されます。', 'パートナータスク・日別タスクのカードを押すと、詳しい内容を開けます。']}/>
        <Note>予定は古い日付から順に並びます。当日分は青い枠と「今日」で強調されますが、先頭には移動しません。</Note>
      </Section>

      <Section id="help-daily" title="日別タスクを登録する">
        <p>下の「日別タスク」を押すと、最初にかんたん入力が開きます。</p>
        <Steps items={['「＋ 新しく登録」を押し、表示されている登録日を確認します。', '「どこで？どんな内容？」に作業を書きます。例：「1階ロビーの電球交換」。この項目は必須です。', '詳しい内容は、必要なときだけ入力します。写真・動画や終了予定時間も任意です。', '担当する人の名前をすべて選びます。複数選べます。', '「次へ」で確認画面を開き、「この内容で登録する」を押します。直すときは「戻る」を押します。']}/>
        <Note>登録日を変えるときは「詳しく入力する」を押し、上部の「◀」「▶」で日付を選びます。その後「かんたん入力（タスク）」で戻れます。通常入力でも、詳しい内容は任意です。</Note>
        <div className="rounded-xl border border-gray-200 p-4 space-y-2"><p className="font-bold">入力の例</p><p>どこで？どんな内容？：1階ロビーの電球交換</p><p>詳しい内容：空欄でもかまいません</p><p>担当者：竹添・高橋など、作業する人を選択</p></div>
      </Section>

      <Section id="help-finish" title="作業が終わったら「終了」を押す">
        <Steps items={['日別タスクまたはパートナーの、かんたん画面を開きます。', '上の「✓ タスクを終了」を押します。登録直後も、この一覧が表示されます。', '終わった作業を確認して、緑色の「終了」を押します。まだ終わっていない作業は押しません。']}/>
        <Note>日別タスクは、担当者として選ばれた人も終了できます。過去の日別タスクでは、追加の終了確認が出ます。カレンダーの詳細から終了するときも、対象を確認して操作してください。</Note>
      </Section>

      <Section id="help-partner" title="パートナータスクを登録する">
        <Steps items={['下の「パートナー」を押し、「＋ 新しく登録」を選びます。', 'パートナー名と「どこ？で何を？」を入力します。例：「〇〇設備」「1階ロビーでエアコン点検」。', '日付・開始時間を選び、担当する人をすべて選びます。担当者は複数選べます。終了予定は任意です。', '必要なら詳しい内容や写真・動画を追加します。空欄でも登録できます。', '「次へ」で内容を確認し、「この内容で登録する」を押します。']}/>
        <Note>時間はすべて15分刻みで選びます。「詳しく入力する」から通常入力にも切り替えられ、入力済みの内容は引き継がれます。</Note>
      </Section>

      <Section id="help-schedule" title="パートナーの日程を変更する">
        <Steps items={['一覧や、かんたん画面の「✓ タスクを終了」で対象のタスクを探します。カレンダーの詳細からも変更できます。', '「日程を変更する」を押します。', '日付・開始時間・終了予定を選び直します。時間は15分刻みです。', '「日程を保存」を押します。取り消すときは「やめる」を押します。']}/>
        <Note>日程だけを変更し、担当者・申し送り・添付は残ります。終了済みのタスクは、このボタンでは日程変更できません。</Note>
        <p className="leading-relaxed">「未終了」のマークは、予定日時を過ぎたタスクだけに付きます。終了予定があればその時刻、なければ開始時刻が基準です。これからの予定には付きません。</p>
      </Section>

      <Section id="help-handoff" title="申し送りを確認・追加する">
        <Steps items={['カレンダーでパートナータスクを押し、詳細を開きます。', '申し送りは古いものが上、新しいものが下です。開いたときは一番下にある最新の内容が表示されます。過去の内容は上へスクロールして読みます。', '追記するときは「編集」を押します。', '履歴のすぐ下にある「今回の申し送り・追記」に、今回伝えたいことを書きます。写真・動画も追加できます。', '「変更を保存」を押します。']}/>
        <Note>パートナーの通常入力画面では、対象タスク右端の鉛筆マークから編集できます。過去の申し送りを消さず、今回の内容を新しく追加してください。</Note>
      </Section>

      <Section id="help-history" title="終了履歴を見る">
        <Steps items={['下の「終了履歴」を押します。', '見たい年月を押して開きます。最初は各月が閉じた状態です。', '日付ごとに終了したタスクを確認します。上の名前を押すと担当者で絞り込めます。']}/>
        <Note>履歴の「削除」は、タスクや申し送りなどの記録を消す操作です。確認画面をよく読み、残すべき記録を削除しないでください。</Note>
      </Section>

      <Section id="help-line" title="LINEグループからタスクを登録する">
        <Steps items={['管理者が連携したLINEグループで、先頭に「タスク」と付けて文章を投稿します。', '表示されたメッセージ内の「メンバータスク」または「パートナータスク」を、投稿した本人が押します。PC・スマホのどちらでも同じボタンを使います。', '日付・担当者が読み取れれば、選んだ種類に登録されます。パートナータスクはパートナー名と15分刻みの開始時刻も必要です。', '不足・曖昧な項目がある場合は、管理者が「設定」→「LINEタスク連携」→「LINEからの要確認」で直して登録します。']}/>
        <Note>投稿例：「タスク」に続けて、改行して「日付：明日」「件名：電球交換」「担当：竹添・高橋」のように書くと読み取りやすくなります。パートナーは「パートナー：山下健装」「時間：10:00」も記入してください。画像は対象外です。登録をやめるときは「キャンセル」を押します。種類の選択期限は24時間です。</Note>
              <h3 className="text-lg font-bold">LINEで申し送りを追加する</h3>
        <Steps items={['登録完了メッセージの「申し送りを追加」を押します。以前からあるタスクは「申し送り 217号室」のように件名の一部を投稿し、日付・パートナー名を確認して対象を選びます。', '「追記 部品を発注しました」のように、先頭に「追記」を付けて本文を送ります。通常の会話は保存しません。', '表示された対象・本文を確認し、入力した本人が「このタスクに追加」を押します。アプリの申し送り履歴にも追加されます。取り消す場合は「キャンセル」です。']}/>
        <Note>入力と選択は30分で期限が切れます。本文を送り直すと、前の確認ボタンは使えなくなります。画像・動画はアプリから追加してください。過去の登録メッセージでは、種類のボタンを再度押すと「申し送りを追加」ボタンを表示できます。</Note>
</Section>

      <Section id="help-other" title="シフト・在庫・個人メモ">
        <div className="space-y-4">
          <div><h3 className="text-lg font-bold">シフト管理</h3><p className="leading-relaxed mt-1">出勤・休みを確認し、権限のある人が変更します。変更内容は他の人にも表示されます。利用できる人だけメニューが表示されます。</p></div>
          <div><h3 className="text-lg font-bold">在庫管理</h3><p className="leading-relaxed mt-1">商品と在庫数を確認します。バーコードや手入力で商品を探し、入出庫を記録できます。日別タスクの通常入力で使用商品と数量を選ぶと、登録時に在庫へ反映されます。</p></div>
          <div><h3 className="text-lg font-bold">自分だけの個人メモ</h3><p className="leading-relaxed mt-1">日別タスクの「詳しく入力する」から、自分の名前を選んで「個人メモ」に切り替えます。内容か写真を追加して保存します。本人だけに表示され、日報には含まれません。</p></div>
        </div>
      </Section>

      {isReportOwner && <Section id="help-report" title="管理者用：当日の日報をプレビューする">
        <Steps items={['「終了履歴」で「日報作成（テスト）」を開きます。この欄は竹添さんのアカウントだけに表示されます。', '対象日を確認します。最初は今日が選ばれています。必要なら天候・塩素投入数・備考を入力します。', '「日報作成・プレビューを表示」を押します。この時点ではDriveに保存されません。', '日報を確認し、保存するときは「Google Driveへ保存」を押します。修正するときは「入力に戻る」を押します。']}/>
        <Note>日報には、その日に終了した作業の終了時刻（最も近い15分）・件名・担当者の苗字、来館業者のパートナー名・件名・担当者の苗字、当日の出勤者などを記載します。未終了タスクや添付の一覧も確認できます。保存時は最新データを読み直します。</Note>
        <p className="leading-relaxed">毎日午前0時台（日本時間）に、前日分だけを自動保存します。通常は毎日の承認や手動操作は不要です。日報は月ごとのファイルに日別シートで保存されます。</p>
      </Section>}

      <Section id="help-support" title="保存できない・操作に迷ったとき">
        <p className="text-base leading-relaxed">保存中は連続してボタンを押さず、完了を待ってください。エラーが出た場合は、表示された内容を確認してください。</p>
        <Note>分からないときや画面がおかしいときは、竹添に伝えてください。エラーの文章や画面の写真があると状況を確認しやすくなります。</Note>
        <p>使い方は、画面上の「使い方」ボタンからいつでも開けます。</p>
      </Section>
    </div>
  </div>;
}

