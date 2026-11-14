import DOMPurify from 'dompurify';
import { escapeHtml } from '../shared/model.mjs';
export function safeHtml(html, query = '') {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'hr'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'], ALLOW_DATA_ATTR: false
  });
  const root = document.createElement('div'); root.innerHTML = clean;
  root.querySelectorAll('img').forEach(image => {
    if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(image.getAttribute('src') || '')) image.remove();
  });
  root.querySelectorAll('a').forEach(a => {
    if (!/^(https?:\/\/|mailto:)/i.test(a.getAttribute('href') || '')) a.removeAttribute('href');
    a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('target', '_blank');
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement.closest('a,code,pre')) continue;
    const regex = /https?:\/\/[^\s<>"'，。；！？）]+/gi;
    let start = 0, match;
    const fragment = document.createDocumentFragment();
    while ((match = regex.exec(node.textContent))) {
      fragment.append(node.textContent.slice(start, match.index));
      const a = document.createElement('a'); a.textContent = match[0]; a.href = match[0]; a.rel = 'noopener noreferrer'; a.target = '_blank'; fragment.append(a);
      start = match.index + match[0].length;
    }
    if (start) { fragment.append(node.textContent.slice(start)); node.replaceWith(fragment); }
  }
  if (query.trim()) {
    const markWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = []; while (markWalker.nextNode()) textNodes.push(markWalker.currentNode);
    const needle = query.trim().toLocaleLowerCase();
    for (const node of textNodes) {
      let start = 0, index; const text = node.textContent; const frag = document.createDocumentFragment();
      while ((index = text.toLocaleLowerCase().indexOf(needle, start)) >= 0) {
        frag.append(text.slice(start, index)); const mark = document.createElement('mark'); mark.textContent = text.slice(index, index + needle.length); frag.append(mark); start = index + needle.length;
      }
      if (start) { frag.append(text.slice(start)); node.replaceWith(frag); }
    }
  }
  return root.innerHTML;
}
export function exportHtml(note) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(note.title)}</title><style>body{max-width:760px;margin:60px auto;padding:24px;font:16px/1.8 system-ui;color:#30362d}img{max-width:100%;border-radius:8px}time{font-size:12px;color:#888}article{margin:28px 0}a{color:#657b57}pre{white-space:pre-wrap;background:#f4f5f1;padding:16px}</style><h1>${escapeHtml(note.title)}</h1>${[...note.entries].sort((a,b)=>a.createdAt-b.createdAt).map(e => `<article><time>${new Date(e.createdAt).toLocaleString('zh-CN')}${e.groupId ? ` · ${escapeHtml(note.groups.find(g=>g.id===e.groupId)?.title || '')}` : ''}</time>${safeHtml(e.html)}</article>`).join('')}${note.draft ? `<article><time>未完成的草稿</time>${safeHtml(note.draft.html)}</article>` : ''}</html>`;
}
export async function imageData(file) {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('请使用 PNG、JPG、GIF 或 WebP 图片');
  if (file.size > 15 * 1024 * 1024) throw new Error('图片太大，请选择 15 MB 以内的图片');
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); });
  if (file.size <= 2 * 1024 * 1024 || file.type === 'image/gif') return data;
  const img = new Image(); img.src = data; await img.decode();
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
}
