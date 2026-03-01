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
  min_contribution: string;
  max_contribution: string;
  start_time: string;
  end_time: string;
  whitelist_only: boolean;
  is_active: boolean;
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
  description: string;
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

// Raw API shapes from backend
interface SalePhaseRaw {
  id: string;
  phase_number: number;
  name: string;
  price_per_token: string;
  allocation: string;
  min_contribution: string;
  max_contribution: string;
  start_time: string;
  end_time: string;
  whitelist_only: boolean;
  is_active: boolean;
}

interface SaleRaw {
  id: string;
  token_id: string;
  issuer_id: string;
  payment_token: string;
  soft_cap: string;
  hard_cap: string;
  status: string;
  total_raised: string;
  is_active: boolean;
  phases: SalePhaseRaw[];
  // Joined fields from token (returned by /api/v1/sales/ endpoint)
  token_name?: string;
  token_symbol?: string;
  token_slug?: string;
  token_asset_type?: string;
  token_description?: string;
  token_image_url?: string;
  issuer_name?: string;
  issuer_slug?: string;
}

interface SaleListRaw {
  items: SaleRaw[];
  total: number;
  page: number;
  size: number;
}

function mapSaleToProject(sale: SaleRaw): Project {
  const status = sale.status as "active" | "upcoming" | "completed" | "paused";
  return {
    id: sale.id,
    title: sale.token_name ?? "Unnamed Project",
    slug: sale.token_slug ?? sale.id,
    imageUrl: sale.token_image_url ?? "",
    assetType: sale.token_asset_type ?? "commodity",
    fundingRound: sale.phases?.[0]?.name ?? "Public Sale",
    currentRaised: parseFloat(sale.total_raised ?? "0"),
    targetAmount: parseFloat(sale.hard_cap ?? "0"),
    investorCount: 0,
    status,
    tokenSymbol: sale.token_symbol ?? "",
    description: sale.token_description ?? "",
    issuer: {
      id: sale.issuer_id,
      name: sale.issuer_name ?? "Cireta Capital",
      slug: sale.issuer_slug ?? "cireta-capital",
    },
    phases: sale.phases ?? [],
  };
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
  const raw = await apiGet<SaleListRaw>(`/api/v1/sales/?${query}`);
  return {
    items: raw.items.map(mapSaleToProject),
    total: raw.total,
    page: raw.page,
    size: raw.size,
  };
}

export async function getProject(slug: string): Promise<Project> {
  const raw = await apiGet<SaleRaw>(`/api/v1/sales/by-slug/${slug}`);
  return mapSaleToProject(raw);
}
