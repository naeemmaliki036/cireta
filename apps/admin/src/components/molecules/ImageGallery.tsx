"use client";

import { useState } from "react";
import { Star, Trash2, ChevronUp, ChevronDown, Plus, Play, Link as LinkIcon } from "lucide-react";
import { FileUpload } from "@/components/atoms";
import { Input, Button } from "@/components/atoms";
import { type UploadResult } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface GalleryItem {
  id: string;
  url: string;
  caption: string;
  is_banner: boolean;
  sort_order: number;
  media_type: "image" | "video";
  video_url?: string;
}

interface ImageGalleryProps {
  items: GalleryItem[];
  onChange: (items: GalleryItem[]) => void;
  maxImages?: number;
  maxVideos?: number;
}

let nextId = 0;
const tempId = () => `temp_${++nextId}_${Date.now()}`;

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

export function ImageGallery({
  items,
  onChange,
  maxImages = 5,
  maxVideos = 1,
}: ImageGalleryProps) {
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoInput, setShowVideoInput] = useState(false);

  const imageCount = items.filter((i) => i.media_type === "image").length;
  const videoCount = items.filter((i) => i.media_type === "video").length;

  const handleImageUpload = (result: UploadResult) => {
    const newItem: GalleryItem = {
      id: tempId(),
      url: result.url,
      caption: "",
      is_banner: items.length === 0,
      sort_order: items.length,
      media_type: "image",
    };
    onChange([...items, newItem]);
  };

  const handleVideoUpload = (result: UploadResult) => {
    const newItem: GalleryItem = {
      id: tempId(),
      url: result.url,
      caption: "",
      is_banner: items.length === 0,
      sort_order: items.length,
      media_type: "video",
      video_url: result.url,
    };
    onChange([...items, newItem]);
  };

  const handleAddVideoUrl = () => {
    if (!videoUrl.trim()) return;
    const thumb = getYouTubeThumbnail(videoUrl) || "/images/video-placeholder.png";
    const newItem: GalleryItem = {
      id: tempId(),
      url: thumb,
      caption: "",
      is_banner: items.length === 0,
      sort_order: items.length,
      media_type: "video",
      video_url: videoUrl.trim(),
    };
    onChange([...items, newItem]);
    setVideoUrl("");
    setShowVideoInput(false);
  };

  const remove = (id: string) => {
    const filtered = items.filter((i) => i.id !== id);
    if (filtered.length > 0 && !filtered.some((i) => i.is_banner)) {
      filtered[0].is_banner = true;
    }
    onChange(filtered);
  };

  const setBanner = (id: string) => {
    onChange(items.map((i) => ({ ...i, is_banner: i.id === id })));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const arr = [...items];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr.map((it, i) => ({ ...it, sort_order: i })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text">Media Gallery</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {imageCount}/{maxImages} images, {videoCount}/{maxVideos} video
          </p>
        </div>
      </div>

      {/* Gallery grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                "relative rounded-xl overflow-hidden border-2 group",
                item.is_banner ? "border-darkAqua" : "border-transparent",
              )}
            >
              <div className="relative h-36">
                <img src={item.url} alt={item.caption || "Gallery"} className="w-full h-full object-cover" />
                {item.media_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-8 w-8 text-white fill-white" />
                  </div>
                )}
                {item.is_banner && (
                  <span className="absolute top-2 left-2 bg-darkAqua text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    HERO
                  </span>
                )}
              </div>
              {/* Actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!item.is_banner && (
                  <button type="button" onClick={() => setBanner(item.id)} title="Set as hero"
                    className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                    <Star className="h-3 w-3" />
                  </button>
                )}
                <button type="button" onClick={() => move(idx, -1)} title="Move up" disabled={idx === 0}
                  className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-30">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => move(idx, 1)} title="Move down" disabled={idx === items.length - 1}
                  className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-30">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => remove(item.id)} title="Remove"
                  className="w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add image */}
      {imageCount < maxImages && (
        <FileUpload
          label={`Add Image (${imageCount}/${maxImages})`}
          accept="image/jpeg,image/png,image/webp,image/gif"
          prefix="sales"
          onUpload={handleImageUpload}
          previewType="image"
        />
      )}

      {/* Add video */}
      {videoCount < maxVideos && (
        <div className="space-y-3">
          <FileUpload
            label={`Upload Video (${videoCount}/${maxVideos})`}
            accept="video/mp4,video/webm,video/quicktime"
            maxSizeMB={50}
            prefix="sales"
            onUpload={handleVideoUpload}
            previewType="document"
          />
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-zinc-400">or paste a link</span></div>
          </div>
          {showVideoInput ? (
            <div className="flex gap-2">
              <Input placeholder="YouTube or Vimeo URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
              <Button variant="primary" onClick={handleAddVideoUrl} disabled={!videoUrl.trim()}>Add</Button>
              <Button variant="outline" onClick={() => { setShowVideoInput(false); setVideoUrl(""); }}>Cancel</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowVideoInput(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-darkBlack/10 p-3 text-sm text-zinc-500 hover:border-darkAqua/50 transition-colors">
              <LinkIcon className="h-4 w-4" /> Add YouTube / Vimeo URL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
