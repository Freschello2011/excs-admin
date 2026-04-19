/* ==================== Device Brand ==================== */

export interface DeviceBrandDTO {
  id: number;
  code: string;
  name: string;
  logo_url?: string;
  website?: string;
  notes?: string;
}

export interface CreateBrandBody {
  code: string;
  name: string;
  logo_url?: string;
  website?: string;
  notes?: string;
}

export interface UpdateBrandBody {
  name: string;
  logo_url?: string;
  website?: string;
  notes?: string;
}

export interface BrandListQuery {
  subcategory_id?: number;
}
