import { TextSelection } from '@tiptap/pm/state';
import { id } from '../shared/model.mjs';

export function groupCurrentLines(state, now = Date.now()) {
  const { $from, $to } = state.selection;
  let recordDepth = 0;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'noteGroup') return { groupId: $from.node(depth).attrs.id, transaction: null };
    if ($from.node(depth).type.name === 'record') recordDepth = depth;
  }
  if (!recordDepth) return null;
  const from = $from.before(recordDepth);
  let to = from + $from.node(recordDepth).nodeSize;
  if (!state.selection.empty && $to.depth > 0 && $to.node(1).type.name === 'record') to = $to.after(1);
  else if (!state.selection.empty && $to.depth === 0) to = Math.max(to, $to.pos);
  let content = state.doc.slice(from, to).content;
  let valid = true;
  content.forEach(node => { if (node.type.name !== 'record') valid = false; });
  if (!valid) { to = from + $from.node(recordDepth).nodeSize; content = state.doc.slice(from, to).content; }
  const groupId = id();
  const group = state.schema.nodes.noteGroup.create({ id: groupId, title: '新分组', createdAt: now }, content);
  const transaction = state.tr.replaceWith(from, to, group);
  const anchor = Math.min(state.selection.anchor, to - 2) + 1;
  const head = Math.min(state.selection.head, to - 2) + 1;
  const $anchor=transaction.doc.resolve(anchor),$head=transaction.doc.resolve(head);
  transaction.setSelection($anchor.parent.inlineContent&&$head.parent.inlineContent
    ?TextSelection.create(transaction.doc,anchor,head)
    :TextSelection.near($head,-1));
  return { groupId, transaction: transaction.scrollIntoView() };
}
