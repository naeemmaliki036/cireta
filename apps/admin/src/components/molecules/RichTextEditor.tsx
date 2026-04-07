"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor, EditorContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Quote,
  Minus, Link2, Unlink, ImageIcon, Youtube as YoutubeIcon,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
  Upload, X, ArrowRight, Pencil, Eye,
} from "lucide-react";
import { apiUpload } from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/utils/mediaUrl";

import type { Editor } from "@tiptap/react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editorRef?: (editor: Editor | null) => void;
}

/* ── Resizable Image Node View ── */

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startX.current = e.clientX;
    startW.current = imgRef.current?.offsetWidth || 300;
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(100, startW.current + diff);
      updateAttributes({ width: newWidth });
    };
    const onUp = () => setResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper className="relative inline-block" data-drag-handle>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        width={node.attrs.width || undefined}
        style={{ width: node.attrs.width ? `${node.attrs.width}px` : undefined, maxWidth: "100%" }}
        className={`rounded-md ${selected ? "ring-2 ring-darkAqua" : ""}`}
        draggable={false}
      />
      {selected && (
        <>
          {/* Resize handle */}
          <div
            onMouseDown={onMouseDown}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-darkAqua/20 hover:bg-darkAqua/40 rounded-r-md"
          />
          {/* Size presets */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1 bg-white border border-zinc-200 rounded-md shadow-sm px-1 py-0.5 z-10">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  const containerWidth = imgRef.current?.parentElement?.parentElement?.offsetWidth || 800;
                  updateAttributes({ width: Math.round(containerWidth * (pct / 100)) });
                }}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
}

const ResizableImage = ImageExt.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, renderHTML: (attrs) => attrs.width ? { width: attrs.width } : {} },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

/* ── Resizable YouTube Node View ── */

function ResizableYoutubeView({ node, updateAttributes, selected }: NodeViewProps) {
  const [resizing, setResizing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startX.current = e.clientX;
    startW.current = wrapRef.current?.offsetWidth || 640;
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(200, startW.current + diff);
      updateAttributes({ width: newWidth, height: Math.round(newWidth * 9 / 16) });
    };
    const onUp = () => setResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing, updateAttributes]);

  const w = node.attrs.width || 640;
  const h = node.attrs.height || 360;

  return (
    <NodeViewWrapper className="relative inline-block">
      <div
        ref={wrapRef}
        style={{ width: `${w}px`, maxWidth: "100%" }}
        className={`relative ${selected ? "ring-2 ring-darkAqua rounded-md" : ""}`}
      >
        <iframe
          src={node.attrs.src}
          width={w}
          height={h}
          style={{ maxWidth: "100%", borderRadius: "6px" }}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
        {selected && (
          <>
            <div
              onMouseDown={onMouseDown}
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-darkAqua/20 hover:bg-darkAqua/40 rounded-r-md"
            />
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1 bg-white border border-zinc-200 rounded-md shadow-sm px-1 py-0.5 z-10">
              {[{ label: "S", w: 320 }, { label: "M", w: 480 }, { label: "L", w: 640 }, { label: "XL", w: 800 }].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => updateAttributes({ width: s.w, height: Math.round(s.w * 9 / 16) })}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const ResizableYoutube = Youtube.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ResizableYoutubeView);
  },
});

/* ── Toolbar primitives ── */

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? "bg-darkAqua text-white"
          : disabled
          ? "text-zinc-300 cursor-not-allowed"
          : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-zinc-200 mx-0.5" />;
}

/* ── Upload Popover ── */

interface UploadPopoverProps {
  type: "image" | "video";
  onInsert: (url: string) => void;
  onClose: () => void;
}

function UploadPopover({ type, onInsert, onClose }: UploadPopoverProps) {
  const [pasteUrl, setPasteUrl] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isImage = type === "image";
  const accept = isImage
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "video/mp4,video/webm";
  const maxMB = isImage ? 10 : 50;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > maxMB * 1024 * 1024) {
      setError(`File too large. Max ${maxMB} MB.`);
      return;
    }
    try {
      setProgress(0);
      const result = await apiUpload(file, "editor-media", "public", setProgress);
      onInsert(resolveMediaUrl(result.url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }, [maxMB, onInsert]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handlePasteUrl = () => {
    const url = pasteUrl.trim();
    if (url) onInsert(url);
  };

  return (
    <div ref={popoverRef} className="absolute top-full left-0 mt-1 z-50 w-72 bg-white border border-zinc-200 rounded-lg shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">{isImage ? "Insert Image" : "Insert Video"}</p>
        <button type="button" onClick={onClose} className="p-0.5 text-zinc-400 hover:text-zinc-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 cursor-pointer transition-colors ${
          dragOver ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-darkAqua/40"
        }`}
      >
        {progress !== null ? (
          <div className="w-full space-y-1.5">
            <p className="text-[11px] text-zinc-500 text-center">Uploading... {progress}%</p>
            <div className="h-1.5 bg-zinc-100 rounded overflow-hidden">
              <div className="h-full bg-darkAqua rounded transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Upload className="h-5 w-5 text-zinc-300" />
            <p className="text-[11px] text-zinc-500">
              Drop {isImage ? "image" : "video"} or <span className="text-darkAqua font-medium">browse</span>
            </p>
            <p className="text-[10px] text-zinc-400">Max {maxMB} MB</p>
          </>
        )}
        <input ref={inputRef} type="file" accept={accept} onChange={onChange} className="hidden" />
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-1 text-[10px] text-zinc-400 mb-1">
          <div className="flex-1 h-px bg-zinc-200" />
          <span>or paste URL</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>
        <div className="flex gap-1">
          <input
            type="url"
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handlePasteUrl(); }}
            placeholder={isImage ? "https://example.com/image.jpg" : "https://youtube.com/watch?v=..."}
            className="flex-1 text-xs border border-zinc-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-darkAqua"
          />
          <button
            type="button"
            onClick={handlePasteUrl}
            disabled={!pasteUrl.trim()}
            className="p-1.5 rounded-md bg-darkAqua text-white hover:opacity-80 disabled:opacity-40 transition-colors"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

/* ── Preview ── */

function Preview({ html }: { html: string }) {
  // Convert video links to playable <video> tags for preview
  const enhanced = html.replace(
    /<a\s+href="([^"]+)"[^>]*>📹[^<]*<\/a>/g,
    (_match, url) => `<video controls src="${url}" style="max-width:100%;border-radius:8px;margin:8px 0;"></video>`
  ).replace(
    // Also catch any plain links to video files
    /<a\s+href="(https?:\/\/[^"]+(?:\.mp4|\.webm|\.mov|\.ogg)[^"]*)"[^>]*>[^<]*<\/a>/gi,
    (_match, url) => `<video controls src="${url}" style="max-width:100%;border-radius:8px;margin:8px 0;"></video>`
  );

  return (
    <div
      className="prose prose-sm max-w-none min-h-[50vh] p-4 bg-white [&_video]:max-w-full [&_video]:rounded-lg [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_img]:max-w-full [&_img]:rounded-md"
      dangerouslySetInnerHTML={{ __html: enhanced }}
    />
  );
}

/* ── Main Editor ── */

export default function RichTextEditor({
  content,
  onChange,
  placeholder: placeholderText,
  editorRef,
}: RichTextEditorProps) {
  const [activePopover, setActivePopover] = useState<"image" | "video" | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExt.configure({ openOnClick: false }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      ResizableYoutube.configure({ width: 640, height: 360 }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholderText || "Start writing..." }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[50vh] p-4 focus:outline-none [&_img]:cursor-pointer",
      },
    },
  });

  if (editorRef) editorRef(editor);

  if (!editor) return null;

  const handleInsertImage = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
    setActivePopover(null);
  };

  const handleInsertVideo = (url: string) => {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    } else {
      // Insert as a linked placeholder — Preview component renders it as <video>
      const filename = url.split("/").pop()?.split("?")[0] || "video";
      editor.chain().focus().insertContent(
        `<p><a href="${url}" target="_blank" rel="noopener noreferrer">📹 Video: ${filename}</a></p>`
      ).run();
    }
    setActivePopover(null);
  };

  const setLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      {/* Edit / Preview tabs */}
      <div className="flex items-center gap-0 bg-zinc-50 border-b border-zinc-200">
        <button type="button" onClick={() => setMode("edit")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            mode === "edit" ? "border-darkAqua text-darkAqua" : "border-transparent text-zinc-400 hover:text-zinc-600"
          }`}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button type="button" onClick={() => setMode("preview")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            mode === "preview" ? "border-darkAqua text-darkAqua" : "border-transparent text-zinc-400 hover:text-zinc-600"
          }`}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>

      {mode === "preview" ? (
        <Preview html={editor.getHTML()} />
      ) : (
      <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-zinc-50 border-b border-zinc-200">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Ordered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align Center">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={setLink} active={editor.isActive("link")} title={editor.isActive("link") ? "Remove Link" : "Add Link"}>
          {editor.isActive("link") ? <Unlink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        </ToolbarButton>

        <div className="relative">
          <ToolbarButton onClick={() => setActivePopover(activePopover === "image" ? null : "image")} active={activePopover === "image"} title="Insert Image">
            <ImageIcon className="h-4 w-4" />
          </ToolbarButton>
          {activePopover === "image" && (
            <UploadPopover type="image" onInsert={handleInsertImage} onClose={() => setActivePopover(null)} />
          )}
        </div>

        <div className="relative">
          <ToolbarButton onClick={() => setActivePopover(activePopover === "video" ? null : "video")} active={activePopover === "video"} title="Insert Video">
            <YoutubeIcon className="h-4 w-4" />
          </ToolbarButton>
          {activePopover === "video" && (
            <UploadPopover type="video" onInsert={handleInsertVideo} onClose={() => setActivePopover(null)} />
          )}
        </div>
      </div>

      <EditorContent editor={editor} />
      </>
      )}
    </div>
  );
}
