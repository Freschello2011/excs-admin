/* ==================== Device Category & Subcategory ==================== */

/** 设备大类 */
export interface DeviceCategoryDTO {
  id: number;
  code: string;
  name: string;
  icon: string;
  sort_order: number;
}

/** 设备小类 */
export interface DeviceSubcategoryDTO {
  id: number;
  category_id: number;
  code: string;
  name: string;
  description?: string;
  sort_order: number;
}
