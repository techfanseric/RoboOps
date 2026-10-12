import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../data/mockData';
import type { CatalogItem } from '../../types/core';
import { createProductConfiguration, defaultProductTemplate, handleProductAction } from './domain';

describe('品牌默认规格模板', () => {
 it('新建采用启用品牌默认快照，旧商品不被品牌覆盖更新', () => {
  const state = createInitialState(); const brand = state.brands[0].name;
  const template = defaultProductTemplate(brand); template.rules.nameMax = 25; template.optionGroups = [];
  state.productTemplates = [template];
  const base: CatalogItem = { id: '', name: '', type: '饮品商品', brand, status: '草稿', attrs: [], flow: '饮品亭履约模板' };
  const config = createProductConfiguration(base, state);
  expect(config.rules?.nameMax).toBe(25); expect(config.templateId).toBe(template.id); expect(config.optionGroups).toEqual([]); expect(config.prices).toHaveLength(1);
  template.rules.nameMax = 30;
  expect(config.rules?.nameMax).toBe(25);
  expect(createProductConfiguration({ ...base, id: 'existing', product: config }, state).rules?.nameMax).toBe(25);
  expect(createProductConfiguration({ ...base, brand: state.brands[1].name }, state).rules?.nameMax).toBe(15);
  template.enabled = false;
  expect(createProductConfiguration(base, state).rules?.nameMax).toBe(15);
 });
 it('成功模板审计挂品牌对象，使同品牌授权同事可见', () => {
  const state = createInitialState(); const brand = state.brands[0];
  const template = defaultProductTemplate(brand.name);
  const result = handleProductAction(state, { type: 'product-template-save', payload: { template, reason: '更新默认' } }, { allowed: true, actor: '运营', now: '10-12 19:00', visibleItemIds: [], visibleBrandNames: [brand.name], visiblePointIds: [] });
  expect(result.error).toBeUndefined(); expect(state.auditLogs[0].object).toBe(brand.id); expect(state.auditLogs[0].detail).toContain(template.id);
 });
});
