import { describe, expect, it } from "vitest";
import { validateCatalogContent } from "./operations";
import type { CatalogItem } from "../types/core";
const item: CatalogItem = { id: "A", name: "奶茶", brand: "茶", type: "商品", status: "上架", attrs: [], flow: "制饮" };
describe("商品反馈规则", () => {
  it("卖点选填，允许 1 条和 20 字，简介允许 200 字", () => {
    expect(validateCatalogContent([], item)).toBe("");
    expect(validateCatalogContent([], { ...item, sellingPoints: ["茶".repeat(20)], introduction: "茶".repeat(200) })).toBe("");
    expect(validateCatalogContent([], { ...item, sellingPoints: ["茶".repeat(21)] })).not.toBe("");
    expect(validateCatalogContent([], { ...item, introduction: "茶".repeat(201) })).not.toBe("");
  });
  it("查重忽略回收站，恢复时检查有效商品", () => {
    const other = { ...item, id: "B", deletedAt: "2026-10-23" };
    expect(validateCatalogContent([other], item)).toBe("");
    expect(validateCatalogContent([item], { ...other, deletedAt: undefined })).not.toBe("");
    expect(validateCatalogContent([item], { ...other, deletedAt: undefined, brand: "其他品牌" })).toBe("");
  });
});

import { createInitialState } from "../data/mockData";
import { appReducer } from "./operations";
describe("回收站状态与权限", () => {
  it("回收、恢复为草稿、永久删除保留历史订单", () => {
    const initial = { ...createInitialState(), currentUserId: "usr-000" };
    const itemId = "sku-002";
    const recycle = appReducer(initial, { type: "catalog-lifecycle", payload: { itemId, operation: "recycle" } });
    expect(recycle.catalog.find((item) => item.id === itemId)?.deletedAt).toBeTruthy();
    const restore = appReducer(recycle, { type: "catalog-lifecycle", payload: { itemId, operation: "restore" } });
    expect(restore.catalog.find((item) => item.id === itemId)).toMatchObject({ status: "草稿" });
    expect(restore.catalog.find((item) => item.id === itemId)?.deletedAt).toBeUndefined();
    const purge = appReducer(recycle, { type: "catalog-lifecycle", payload: { itemId, operation: "purge" } });
    expect(purge.catalog.find((item) => item.id === itemId)).toBeUndefined();
    expect(purge.businessRequests).toEqual(initial.businessRequests);
  });
  it("只读账号不能删除，未回收商品不可永久删除", () => {
    const initial = { ...createInitialState(), currentUserId: "usr-013" };
    expect(appReducer(initial, { type: "catalog-lifecycle", payload: { itemId: "sku-002", operation: "recycle" } }).catalog).toEqual(initial.catalog);
    const admin = { ...initial, currentUserId: "usr-000" };
    expect(appReducer(admin, { type: "catalog-lifecycle", payload: { itemId: "sku-002", operation: "purge" } }).catalog).toEqual(admin.catalog);
  });
});
