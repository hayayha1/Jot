import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { safeHtml, imageData } from './rich';

export default forwardRef(function Editor({ content = '', placeholder = '想到什么，就记在这里…', onChange, onSubmit, onError, autofocus = false, className = '' }, ref) {
  const handlers = useRef({ onChange, onSubmit, onError }); handlers.current = { onChange, onSubmit, onError };
  const fileInput = useRef(null);
  const editorRef = useRef(null);
  const insertFiles = async files => {
    try { for (const file of files) { const src = await imageData(file); editorRef.current?.chain().focus().setImage({ src, alt: file.name || '粘贴的图片' }).run(); } }
    catch (error) { handlers.current.onError?.(error.message); }
  };
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['https', 'http', 'mailto'] } }), Image.configure({ allowBase64: true }), Placeholder.configure({ placeholder })],
    content: safeHtml(content), autofocus,
    editorProps: {
      attributes: { class: 'rich-text', 'aria-label': placeholder, role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML: html => safeHtml(html),
      handleKeyDown(view, event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !view.composing && event.keyCode !== 229 && handlers.current.onSubmit) { event.preventDefault(); handlers.current.onSubmit(); return true; }
        return false;
      },
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (files.length) { event.preventDefault(); insertFiles(files); return true; } return false;
      },
      handleDrop(_view, event, _slice, moved) {
        if (moved) return false;
        const files = [...(event.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
        if (files.length) { event.preventDefault(); insertFiles(files); return true; } return false;
      }
    },
    onUpdate({ editor }) { handlers.current.onChange?.(editor.getHTML()); }
  });
  editorRef.current = editor;
  useImperativeHandle(ref, () => ({
    html: () => editor?.getHTML() || '',
    focus: () => editor?.commands.focus('end'),
    clear: () => editor?.commands.clearContent(false),
    image: () => fileInput.current?.click(),
    bold: () => editor?.chain().focus().toggleBold().run(),
    list: () => editor?.chain().focus().toggleBulletList().run(),
    code: () => editor?.chain().focus().toggleCodeBlock().run(),
    link: url => editor?.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
  }), [editor]);
  return <div className={`editor ${className}`}><EditorContent editor={editor} /><input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple tabIndex={-1} onChange={event => { insertFiles([...event.target.files]); event.target.value = ''; }} /></div>;
});
