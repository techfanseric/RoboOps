import { useMemo } from "react";
import type { AppState, ScopeSelection, ScopeType } from "../types/core";
import { ReadonlyField } from "./ui";

const scopeTypeLabels: Record<ScopeType, string> = {
  tenant: "租户",
  brand: "品牌",
  organization: "组织",
  city: "城市/区域",
  point: "点位",
  device: "设备",
  scenario: "场景模板",
};

const defaultScopeTypes: ScopeType[] = ["tenant", "brand", "organization", "city", "point", "device", "scenario"];

export function scopeTypeLabel(type: ScopeType): string {
  return scopeTypeLabels[type];
}

export function buildScopeOptions(state: AppState, allowedTypes: ScopeType[] = defaultScopeTypes): ScopeSelection[] {
  const options: ScopeSelection[] = [];
  if (allowedTypes.includes("tenant")) {
    options.push(...state.tenants.map((tenant) => ({
      type: "tenant" as const,
      id: tenant.id,
      label: tenant.name,
      value: `${tenant.name} / 全部品牌`,
      parent: tenant.mode,
    })));
  }
  if (allowedTypes.includes("brand")) {
    options.push(...state.brands.map((brand) => ({
      type: "brand" as const,
      id: brand.id,
      label: brand.name,
      value: `${brand.tenant} / ${brand.name}`,
      parent: brand.tenant,
    })));
  }
  if (allowedTypes.includes("organization")) {
    options.push(...state.organizations.map((organization) => ({
      type: "organization" as const,
      id: organization.id,
      label: organization.name,
      value: `${organization.tenant} / ${organization.name}`,
      parent: organization.tenant,
    })));
  }
  if (allowedTypes.includes("city")) {
    const cities = Array.from(new Set(state.points.map((point) => point.city))).filter(Boolean);
    options.push(...cities.map((city) => ({
      type: "city" as const,
      id: `city-${city}`,
      label: city,
      value: city,
      parent: "全部品牌",
    })));
  }
  if (allowedTypes.includes("point")) {
    options.push(...state.points.map((point) => ({
      type: "point" as const,
      id: point.id,
      label: point.name,
      value: `${point.brand} / ${point.city} / ${point.name}`,
      parent: point.brand,
    })));
  }
  if (allowedTypes.includes("device")) {
    options.push(...state.devices.map((device) => {
      const point = state.points.find((item) => item.name === device.point);
      return {
        type: "device" as const,
        id: device.id,
        label: device.name,
        value: `${point?.brand || "设备"} / ${device.point} / ${device.name}`,
        parent: device.point,
      };
    }));
  }
  if (allowedTypes.includes("scenario")) {
    options.push(...state.templates.map((template) => ({
      type: "scenario" as const,
      id: template.id,
      label: template.name,
      value: `场景模板 / ${template.name}`,
      parent: template.objectName,
    })));
  }
  return options;
}

export function firstScopeSelection(state: AppState, preferredType: ScopeType = "brand", allowedTypes: ScopeType[] = defaultScopeTypes): ScopeSelection {
  const options = buildScopeOptions(state, allowedTypes);
  return options.find((option) => option.type === preferredType) || options[0] || { type: preferredType, id: "all", label: "全部", value: "全部", parent: "系统" };
}

export function findScopeSelection(state: AppState, value: string, allowedTypes: ScopeType[] = defaultScopeTypes): ScopeSelection | undefined {
  const options = buildScopeOptions(state, allowedTypes);
  return options.find((option) => option.value === value || option.id === value || option.label === value);
}

export function resolveScopeSelection(state: AppState, value: string, allowedTypes: ScopeType[] = defaultScopeTypes): ScopeSelection | undefined {
  const direct = findScopeSelection(state, value, allowedTypes);
  if (direct || !value.trim()) return direct;

  if (allowedTypes.includes("device")) {
    const device = state.devices.find((item) => value.includes(item.name) || value.includes(item.sn));
    if (device) {
      const point = state.points.find((item) => item.name === device.point);
      return {
        type: "device",
        id: device.id,
        label: device.name,
        value,
        parent: point?.name || device.point,
      };
    }
  }

  if (allowedTypes.includes("point")) {
    const point = state.points.find((item) => value.includes(item.name));
    if (point) return { type: "point", id: point.id, label: point.name, value, parent: point.brand };
  }

  if (allowedTypes.includes("city")) {
    const point = state.points.find((item) => value.includes(item.city) && (value.includes(item.brand) || value === item.city));
    if (point) return { type: "city", id: `city-${point.city}`, label: point.city, value, parent: point.brand };
  }

  if (allowedTypes.includes("brand")) {
    const brand = state.brands.find((item) => value.includes(item.name));
    if (brand) return { type: "brand", id: brand.id, label: brand.name, value, parent: brand.tenant };
  }

  if (allowedTypes.includes("organization")) {
    const organization = state.organizations.find((item) => value.includes(item.name));
    if (organization) return { type: "organization", id: organization.id, label: organization.name, value, parent: organization.tenant };
  }

  if (allowedTypes.includes("tenant")) {
    const tenant = state.tenants.find((item) => value.includes(item.name));
    if (tenant) return { type: "tenant", id: tenant.id, label: tenant.name, value, parent: tenant.mode };
  }

  if (allowedTypes.includes("scenario")) {
    const template = state.templates.find((item) => value.includes(item.name));
    if (template) return { type: "scenario", id: template.id, label: template.name, value, parent: template.objectName };
  }

  return undefined;
}

export function ScopeSelector({
  state,
  value,
  onChange,
  allowedTypes = defaultScopeTypes,
}: {
  state: AppState;
  value: ScopeSelection;
  onChange: (value: ScopeSelection) => void;
  allowedTypes?: ScopeType[];
}) {
  const options = useMemo(() => buildScopeOptions(state, allowedTypes), [allowedTypes, state]);
  const typeOptions = allowedTypes.filter((type) => options.some((option) => option.type === type));
  const currentType = typeOptions.includes(value.type) ? value.type : typeOptions[0];
  const currentOptions = options.filter((option) => option.type === currentType);
  const currentValue = currentOptions.some((option) => option.id === value.id) ? value.id : currentOptions[0]?.id;

  function chooseType(type: ScopeType) {
    const next = options.find((option) => option.type === type);
    if (next) onChange(next);
  }

  function chooseScope(id: string) {
    const next = currentOptions.find((option) => option.id === id);
    if (next) onChange(next);
  }

  return (
    <>
      <label className="field">
        <span>范围层级</span>
        <select value={currentType} onChange={(event) => chooseType(event.target.value as ScopeType)}>
          {typeOptions.map((type) => <option key={type} value={type}>{scopeTypeLabels[type]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>具体范围</span>
        <select value={currentValue} onChange={(event) => chooseScope(event.target.value)}>
          {currentOptions.map((option) => <option key={option.id} value={option.id}>{option.label}{option.parent ? ` / ${option.parent}` : ""}</option>)}
        </select>
      </label>
      <div className="field full">
        <ReadonlyField label="写入范围" value={value.value} />
      </div>
    </>
  );
}
