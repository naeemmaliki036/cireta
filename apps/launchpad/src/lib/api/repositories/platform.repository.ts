import { apiFetch } from "../client";

export interface PlatformStat {
  key: string;
  value: string;
  label: string;
  sort_order: number;
}

export interface Partner {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  sort_order: number;
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  sort_order: number;
}

export async function getPlatformStats(): Promise<PlatformStat[]> {
  return apiFetch<PlatformStat[]>("/api/v1/platform/stats", {
    skipAuthRedirect: true,
  });
}

export async function getPartners(): Promise<Partner[]> {
  return apiFetch<Partner[]>("/api/v1/platform/partners", {
    skipAuthRedirect: true,
  });
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>("/api/v1/platform/team", {
    skipAuthRedirect: true,
  });
}
