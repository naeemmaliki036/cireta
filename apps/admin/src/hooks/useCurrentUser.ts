"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api/client";

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
}

let _cached: CurrentUser | null = null;

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(_cached);

  useEffect(() => {
    if (_cached) return;
    let cancelled = false;
    apiGet<CurrentUser>("/api/v1/auth/me")
      .then((data) => {
        if (cancelled) return;
        _cached = data;
        setUser(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return user;
}
