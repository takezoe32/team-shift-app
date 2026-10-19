const clip = (value, max) => { let text = ''; for (const character of String(value)) { if (text.length + character.length > max) break; text += character; } return text; };
export const lineAction = (label, data) => ({ type: 'postback', label: clip(label, 20), data, displayText: '「' + clip(label, 20) + '」を選択' });

// Basic Flex components work on both mobile and desktop LINE clients.
export function lineButtons(text, actions, altText = 'タスクの操作', title = '') {
  return { type: 'flex', altText, contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
    ...(title ? [{ type: 'text', text: title, weight: 'bold', size: 'lg', color: '#1F2937' }] : []),
    { type: 'text', text: clip(text, 160), wrap: true, size: 'sm', color: '#4B5563' },
    ...actions.map(action => {
      const secondary = /キャンセル|戻る|最初の/.test(action.label);
      const color = /登録|このタスクに追加/.test(action.label) ? '#059669' : /パートナー/.test(action.label) ? '#7C3AED' : '#2563EB';
      return { type: 'button', style: secondary ? 'secondary' : 'primary', ...(!secondary ? { color } : {}), height: 'md', action: { ...action, displayText: action.displayText || '「' + clip(action.label, 20) + '」を選択' } };
    })
  ] } } };
}
