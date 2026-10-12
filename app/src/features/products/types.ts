import type { CatalogItem, ProductVariant } from "../../types/core";

export interface ProductOptionGroup { id: string; name: string; options: string[]; affectsPrice: boolean; optionIds?: string[]; disabledOptionIds?: string[]; required?: boolean; enabled?: boolean }
export interface ProductPrice { key: string; selections: Record<string, string>; original: string; promotional: string }
export interface ProductImage { id: string; name: string; url: string; width: number; height: number }
export interface ProductRules { nameMax: number; sellingPointMin: number; sellingPointMax: number; sellingPointLength: number; introductionMax: number; imageMin: number; imageMax: number }
export interface ProductTemplate { id: string; name: string; brand: string; enabled: boolean; optionGroups: ProductOptionGroup[]; rules: ProductRules }
export interface ProductConfiguration {
  rules?: ProductRules;
  priceArchive?: ProductPrice[];
  /** Stable identity of every price combination, including temporarily inactive rows. */
  priceSkuIds?: Record<string, string>;
  templateId?: string;
  version: 1;
  sellingPoints: string[];
  introduction: string;
  optionGroups: ProductOptionGroup[];
  prices: ProductPrice[];
  images: ProductImage[];
  pointIds: string[];
  deletedAt?: string;
  previousStatus?: string;
  legacyVariants?: ProductVariant[];
}
export type ProductOperation = "publish" | "unpublish" | "delete" | "restore";
export type ProductAction =
  | { type: "product-template-save"; payload: { template: ProductTemplate; reason: string } }
  | { type: "product-save"; payload: { item: CatalogItem; reason: string; publish: boolean } }
  | { type: "product-batch"; payload: { ids: string[]; operation: ProductOperation; reason: string } };
export interface ProductActionContext {
  allowed: boolean;
  actor: string;
  visibleItemIds: string[];
  visibleBrandNames: string[];
  visiblePointIds: string[];
  now: string;
}
