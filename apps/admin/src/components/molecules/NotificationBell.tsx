"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, X, CheckCheck } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, string> | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount + poll every 30s
  useEffect(() => {
    const fetchCount = () => {
      apiFetch<{ count: number }>("/api/v1/notifications/unread-count")
        .then((data) => setUnreadCount(data.count))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    apiFetch<{ notifications: Notification[] }>("/api/v1/notifications?limit=10")
      .then((data) => setNotifications(data.notifications))
      .catch(() => {});
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    await apiFetch("/api/v1/notifications/read-all", { method: "PATCH" });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = async (id: string) => {
    await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
      >
        <Bell className="h-4 w-4 text-zinc-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-md flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg border border-zinc-200 shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-6 w-6 text-zinc-200 mx-auto mb-2" />
                <p className="text-xs text-zinc-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer ${
                    !n.read ? "bg-blue-50/50" : ""
                  }`}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.data?.action_url) {
                      setOpen(false);
                      window.location.href = n.data.action_url;
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <div className="w-1.5 h-1.5 rounded-md bg-blue-500 mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-900 truncate">{n.title}</p>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-zinc-300 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
