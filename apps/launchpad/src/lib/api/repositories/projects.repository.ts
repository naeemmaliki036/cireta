import { apiGet } from "../client";

export interface ProjectIssuer {
  id: string;
  name: string;
  slug: string;
}

export interface ProjectPhase {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  sold: string;
  min_contribution: string;
  max_contribution: string;
  start_time: string;
  end_time: string;
  whitelist_only: boolean;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  imageUrl: string;
  assetType: string;
  fundingRound: string;
  currentRaised: number;
  targetAmount: number;
  investorCount: number;
  status: "active" | "upcoming" | "completed" | "paused";
  tokenSymbol: string;
  issuer: ProjectIssuer;
  phases: ProjectPhase[];
}

export interface ProjectFilters {
  assetType?: string;
  status?: string;
  search?: string;
  page?: number;
  size?: number;
}

export interface ProjectListResponse {
  items: Project[];
  total: number;
  page: number;
  size: number;
}

export async function getProjects(
  filters?: ProjectFilters
): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  if (filters?.assetType && filters.assetType !== "All") {
    params.set("asset_type", filters.assetType);
  }
  if (filters?.status && filters.status !== "All") {
    params.set("status", filters.status);
  }
  if (filters?.search) {
    params.set("search", filters.search);
  }
  params.set("page", String(filters?.page ?? 1));
  params.set("size", String(filters?.size ?? 20));

  const query = params.toString();
  return apiGet<ProjectListResponse>(`/api/v1/sales/?${query}`);
}

export async function getProject(slug: string): Promise<Project> {
  return apiGet<Project>(`/api/v1/sales/by-slug/${slug}`);
}
