import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory, historySearchText, searchWords } from '../src/completedTaskSearch.mjs';
import { taskHistoryEntries } from '../src/taskHistory.mjs';

const entries = [
  { id: 'a', title: '1階ロビーの電球交換', content: 'LED40W形に変更', assigneeNames: ['竹添三剛'], ownerName: '竹添三剛', completedByName: '竹添三剛', historyLabel: 'タスク終了', handoffs: [] },
  { id: 'b', title: 'プール漏水調査', content: '', partnerName: 'クラフティア', assigneeNames: ['江藤公二'], ownerName: '江藤公二', completedByName: '江藤公二', historyLabel: 'タスク終了', handoffs: [{ text: 'バルブ交換で止水を確認', authorName: '平川千尋' }] },
  { id: 'c', title: '植栽剪定', content: '', productName: 'ごみ袋 90L', assigneeNames: [], ownerName: '高橋信次', completedByName: '高橋信次', historyLabel: '本日分終了', handoffs: [] },
];
const ids = query => filterHistory(entries, query).map(entry => entry.id);

test('キーワードが空なら全件、件名・内容・パートナー名・担当者・使用商品から探す', () => {
  assert.deepEqual(ids(''), ['a', 'b', 'c']);
  assert.deepEqual(ids('   '), ['a', 'b', 'c']);
  assert.deepEqual(ids('電球'), ['a']);
  assert.deepEqual(ids('LED40'), ['a']);
  assert.deepEqual(ids('クラフティア'), ['b']);
  assert.deepEqual(ids('江藤'), ['b']);
  assert.deepEqual(ids('ごみ袋'), ['c']);
  assert.deepEqual(ids('見つからない言葉'), []);
});
test('申し送りの本文と書いた人からも探す', () => {
  assert.deepEqual(ids('止水'), ['b']);
  assert.deepEqual(ids('平川'), ['b']);
});
test('空白で区切った言葉はすべて含むものだけ（全角の空白も区切り）', () => {
  assert.deepEqual(ids('プール バルブ'), ['b']);
  assert.deepEqual(ids('プール　バルブ'), ['b']);
  assert.deepEqual(ids('プール 電球'), []);
  assert.deepEqual(searchWords('  プール　 バルブ '), ['ぷーる', 'ばるぶ']);
});
test('全角・半角、大文字・小文字、ひらがな・カタカナの違いは同じものとして探す', () => {
  assert.deepEqual(ids('led４０ｗ'), ['a']);
  assert.deepEqual(ids('ぷーる'), ['b']);
  assert.deepEqual(ids('ﾌﾟｰﾙ'), ['b']);
  assert.deepEqual(ids('ロビー'), ['a']);
  assert.deepEqual(ids('ろびー'), ['a']);
  assert.ok(historySearchText(entries[1]).includes('くらふてぃあ'));
});
test('「本日分終了」の行は、その日の申し送りだけを持ち、タスク全体の申し送り履歴は持たない', () => {
  const base = { id: 't', title: '期間の作業', content: '本文', handoffs: [{ text: '全体の申し送り', authorName: 'A' }], date: '2026-11-01', completedAt: '2026-11-03T01:00:00.000Z' };
  const rows = taskHistoryEntries(base, { completed: true, dailyWork: { '2026-11-02': { note: '2日の申し送り', actorName: 'B', completedAt: '2026-11-02T08:00:00.000Z' } } });
  const complete = rows.find(row => row.historyKind === 'complete'), daily = rows.find(row => row.historyKind === 'daily');
  assert.equal(complete.handoffs.length, 1);
  assert.deepEqual(daily.handoffs, []);
  assert.deepEqual(filterHistory(rows, '全体の申し送り').map(row => row.historyKind), ['complete']);
  assert.deepEqual(filterHistory(rows, '2日の').map(row => row.historyKind), ['daily']);
});
