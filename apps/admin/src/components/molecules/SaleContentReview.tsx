"use client";

import { useState, useEffect } from "react";
import { FileText, Users, HelpCircle, ImageIcon, ChevronDown, ChevronUp, Play, Download, AlignLeft, X } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface SaleImage { id: string; url: string; caption?: string; is_banner?: boolean; sort_order?: number; media_type?: string; video_url?: string }
interface TeamMember { id: string; name: string; title?: string; bio?: string; photo_url?: string }
interface FAQ { id: string; question: string; answer: string }
interface SaleDoc { id: string; name: string; doc_type: string; url?: string }

interface SaleContentReviewProps {
  saleId: string;
  description?: string | null;
  fullDescription?: string | null;
}

const TABS = [
  { key: "overview", label: "Overview", icon: AlignLeft },
  { key: "gallery", label: "Gallery", icon: ImageIcon },
  { key: "team", label: "Team", icon: Users },
  { key: "faq", label: "FAQ", icon: HelpCircle },
  { key: "documents", label: "Documents", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function SaleContentReview({ saleId, description, fullDescription }: SaleContentReviewProps) {
  const [images, setImages] = useState<SaleImage[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [docs, setDocs] = useState<SaleDoc[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedMedia, setSelectedMedia] = useState<SaleImage | null>(null);

  useEffect(() => {
    if (!saleId) return;
    apiGet<SaleImage[]>(`/api/v1/sales/${saleId}/images`).then(setImages).catch(() => {});
    apiGet<TeamMember[]>(`/api/v1/sales/${saleId}/team`).then(setTeam).catch(() => {});
    apiGet<FAQ[]>(`/api/v1/sales/${saleId}/faqs`).then(setFaqs).catch(() => {});
    apiGet<SaleDoc[]>(`/api/v1/sales/${saleId}/documents`).then(setDocs).catch(() => {});
  }, [saleId]);

  const counts: Record<TabKey, number> = {
    overview: description || fullDescription ? 1 : 0,
    gallery: images.length,
    team: team.length,
    faq: faqs.length,
    documents: docs.length,
  };

  return (
    <div className="bg-white rounded-lg border border-darkBlack/10 overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-zinc-100 px-6">
        <div className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab.key
                  ? "text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-text"
              )}
              style={activeTab === tab.key ? { backgroundColor: "#13636F" } : undefined}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-md",
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500"
                )}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {/* Overview */}
        {activeTab === "overview" && (
          <div>
            {description || fullDescription ? (
              <div className="space-y-4">
                {description && <p className="text-sm text-zinc-600">{description}</p>}
                {fullDescription && (
                  <div className="prose prose-sm max-w-none text-zinc-600" dangerouslySetInnerHTML={{ __html: fullDescription }} />
                )}
              </div>
            ) : (
              <p className="text-zinc-400 text-sm text-center py-8">No description provided</p>
            )}
          </div>
        )}

        {/* Gallery */}
        {activeTab === "gallery" && (
          images.length > 0 ? (
            <div className="space-y-4">
              {/* Player / preview */}
              {selectedMedia && (
                <div className="relative rounded-lg overflow-hidden bg-black">
                  <button onClick={() => setSelectedMedia(null)}
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                    <X className="h-4 w-4" />
                  </button>
                  {selectedMedia.media_type === "video" && selectedMedia.video_url ? (
                    (() => {
                      const ytMatch = selectedMedia.video_url!.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
                      const vimeoMatch = selectedMedia.video_url!.match(/vimeo\.com\/(\d+)/);
                      if (ytMatch) return <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`} className="w-full aspect-video" allow="autoplay; encrypted-media" allowFullScreen />;
                      if (vimeoMatch) return <iframe src={`https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`} className="w-full aspect-video" allow="autoplay" allowFullScreen />;
                      return <video src={selectedMedia.video_url} className="w-full aspect-video" controls autoPlay />;
                    })()
                  ) : (
                    <img src={selectedMedia.url} alt={selectedMedia.caption || ""} className="w-full max-h-[400px] object-contain" />
                  )}
                  {selectedMedia.caption && <p className="text-sm text-zinc-300 px-4 py-2">{selectedMedia.caption}</p>}
                </div>
              )}
              {/* Thumbnail grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((img) => (
                  <button key={img.id} onClick={() => setSelectedMedia(img)}
                    className={cn("relative rounded-lg overflow-hidden border-2 text-left transition-all", selectedMedia?.id === img.id ? "border-darkAqua ring-2 ring-darkAqua/30" : "border-zinc-100 hover:border-zinc-300")}>
                    <div className="relative h-32">
                      <img src={img.url} alt={img.caption || ""} className="w-full h-full object-cover" />
                      {img.media_type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-6 w-6 text-white fill-white" />
                        </div>
                      )}
                      {img.is_banner && (
                        <span className="absolute top-1.5 left-1.5 bg-darkAqua text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">HERO</span>
                      )}
                    </div>
                    {img.caption && <p className="text-[11px] text-zinc-500 px-2 py-1.5 truncate">{img.caption}</p>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-400 text-sm text-center py-8">No media uploaded</p>
          )
        )}

        {/* Team */}
        {activeTab === "team" && (
          team.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {team.map((m) => (
                <div key={m.id} className="flex gap-3 p-4 rounded-lg bg-zinc-50">
                  <div className="w-12 h-12 rounded-md bg-zinc-200 overflow-hidden shrink-0">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">{m.name[0]}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-text">{m.name}</p>
                    {m.title && <p className="text-xs text-darkAqua">{m.title}</p>}
                    {m.bio && <p className="text-xs text-zinc-500 mt-1 line-clamp-3">{m.bio}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-400 text-sm text-center py-8">No team members added</p>
          )
        )}

        {/* FAQ */}
        {activeTab === "faq" && (
          faqs.length > 0 ? (
            <div className="space-y-2">
              {faqs.map((f) => (
                <div key={f.id} className="border border-zinc-100 rounded-lg overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <span className="font-medium text-sm text-text">{f.question}</span>
                    {openFaq === f.id ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                  </button>
                  {openFaq === f.id && <div className="px-4 pb-3 text-sm text-zinc-600">{f.answer}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-400 text-sm text-center py-8">No FAQs added</p>
          )
        )}

        {/* Documents */}
        {activeTab === "documents" && (
          docs.length > 0 ? (
            <div className="space-y-2">
              {docs.map((d) => (
                <a key={d.id} href={d.url || "#"} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-darkAqua shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-text">{d.name}</p>
                      <p className="text-xs text-zinc-400 capitalize">{d.doc_type}</p>
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-zinc-400" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-zinc-400 text-sm text-center py-8">No documents uploaded</p>
          )
        )}
      </div>
    </div>
  );
}
