import { useEffect } from 'react';

const activeEditors = new Map();
export function confirmEditDiscard(editing, saving = false, confirm = message => window.confirm(message)) {
  if (saving) return false;
  return !editing || confirm('編集中の内容を破棄しますか？\n保存していない変更は失われます。');
}
export function confirmDiscardEdits() {
  return confirmEditDiscard(activeEditors.size > 0, [...activeEditors.values()].some(Boolean));
}
export function useEditGuard(editing, saving = false) {
  useEffect(() => {
    if (!editing) return;
    const token = {};
    activeEditors.set(token, saving);
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { activeEditors.delete(token); window.removeEventListener('beforeunload', beforeUnload); };
  }, [editing, saving]);
}
