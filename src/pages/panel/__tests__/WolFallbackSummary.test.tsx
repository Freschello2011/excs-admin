// @vitest-environment jsdom
/**
 * WolFallbackSummary — ADR-0029 单测
 *
 * 验证：
 *   - 无 WOL 设备引用 → 不渲染（return null）
 *   - 引用 WOL 设备 + 兜底未配置 → 显示「未配置」Tag
 *   - 引用 WOL 设备 + 兜底已开启 + 缺 subnet_broadcast → 显示「已开启」+「缺子网广播」warning
 *   - 引用 WOL 设备 + require_lan_sanity=false → 显示「弱判定」warning
 *   - 多个 WOL 设备引用 → 多行
 *   - 同一设备被引用多次 → 去重
 *   - 跳转链接带 ?openEdit={id}
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WolFallbackSummary from '../components/WolFallbackSummary';
import type { DeviceListItem } from '@/api/gen/client';
import type { ActionStep } from '@/pages/_shared/runbook/types';

afterEach(cleanup);

// ──────────── fixtures ────────────

const wolDevEnabled: DeviceListItem = {
  id: 100,
  hall_id: 1,
  name: 'PC 一号',
  connector_kind: 'protocol',
  connector_ref: { protocol: 'wol' },
  connection_config: {
    mac_address: 'AA:BB:CC:DD:EE:FF',
    broadcast: '255.255.255.255',
    port: 9,
    control_app_fallback: {
      enabled: true,
      require_lan_sanity: true,
      subnet_broadcast: '192.168.50.255',
    },
  } as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

const wolDevNoFallback: DeviceListItem = {
  id: 101,
  hall_id: 1,
  name: 'PC 二号',
  connector_kind: 'protocol',
  connector_ref: { protocol: 'wol' },
  connection_config: {
    mac_address: 'AA:BB:CC:DD:EE:00',
  } as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

const wolDevMissingSubnet: DeviceListItem = {
  id: 102,
  hall_id: 1,
  name: 'PC 三号',
  connector_kind: 'protocol',
  connector_ref: { protocol: 'wol' },
  connection_config: {
    mac_address: 'AA:BB:CC:DD:EE:11',
    control_app_fallback: { enabled: true, require_lan_sanity: true },
  } as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

const wolDevWeakSanity: DeviceListItem = {
  id: 103,
  hall_id: 1,
  name: 'PC 四号',
  connector_kind: 'protocol',
  connector_ref: { protocol: 'wol' },
  connection_config: {
    mac_address: 'AA:BB:CC:DD:EE:22',
    control_app_fallback: {
      enabled: true,
      require_lan_sanity: false,
      subnet_broadcast: '10.0.0.255',
    },
  } as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

const pjlinkDev: DeviceListItem = {
  id: 200,
  hall_id: 1,
  name: '投影机',
  connector_kind: 'protocol',
  connector_ref: { protocol: 'pjlink' },
  connection_config: { host: '192.168.1.10', port: 4352 } as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

const presetDev: DeviceListItem = {
  id: 201,
  hall_id: 1,
  name: 'K32',
  connector_kind: 'preset',
  connector_ref: { preset_key: 'xiuzhan_k32' },
  connection_config: {} as unknown as DeviceListItem['connection_config'],
  status: 'online',
};

function renderSummary(actions: ActionStep[], devices: DeviceListItem[]) {
  return render(
    <MemoryRouter>
      <WolFallbackSummary actions={actions} devices={devices} />
    </MemoryRouter>,
  );
}

function deviceAction(device_id: number, command = 'open'): ActionStep {
  return {
    type: 'device',
    delay_ms: 0,
    delay_seconds_after_prev_start: 0,
    preconditions: [],
    device_id,
    command,
  } as unknown as ActionStep;
}

// ──────────── tests ────────────

describe('<WolFallbackSummary>', () => {
  it('无 WOL 设备引用 → 不渲染', () => {
    const { container } = renderSummary(
      [deviceAction(200), deviceAction(201)],
      [pjlinkDev, presetDev],
    );
    expect(container.firstChild).toBeNull();
  });

  it('actions 引用 WOL 设备 + 兜底未配置 → 显示 「未配置」 Tag', () => {
    renderSummary([deviceAction(101)], [wolDevNoFallback, pjlinkDev]);
    expect(screen.getByText('PC 二号')).toBeInTheDocument();
    expect(screen.getByText('未配置')).toBeInTheDocument();
    expect(screen.queryByText('已开启')).toBeNull();
  });

  it('已开启 + 配齐 subnet_broadcast → 仅 「已开启」 Tag', () => {
    renderSummary([deviceAction(100)], [wolDevEnabled]);
    expect(screen.getByText('PC 一号')).toBeInTheDocument();
    expect(screen.getByText('已开启')).toBeInTheDocument();
    expect(screen.queryByText('缺子网广播')).toBeNull();
    expect(screen.queryByText('弱判定')).toBeNull();
  });

  it('已开启 + 缺 subnet_broadcast → 显示 「缺子网广播」 warning', () => {
    renderSummary([deviceAction(102)], [wolDevMissingSubnet]);
    expect(screen.getByText('已开启')).toBeInTheDocument();
    expect(screen.getByText('缺子网广播')).toBeInTheDocument();
  });

  it('已开启 + require_lan_sanity=false → 显示 「弱判定」 warning', () => {
    renderSummary([deviceAction(103)], [wolDevWeakSanity]);
    expect(screen.getByText('已开启')).toBeInTheDocument();
    expect(screen.getByText('弱判定')).toBeInTheDocument();
  });

  it('多 WOL 设备引用 → 多行展示', () => {
    renderSummary(
      [deviceAction(100), deviceAction(101), deviceAction(102)],
      [wolDevEnabled, wolDevNoFallback, wolDevMissingSubnet, pjlinkDev],
    );
    expect(screen.getByText('PC 一号')).toBeInTheDocument();
    expect(screen.getByText('PC 二号')).toBeInTheDocument();
    expect(screen.getByText('PC 三号')).toBeInTheDocument();
    // 标题里 "本按钮涉及 3 台 WOL 设备"
    expect(screen.getByText(/3.*台.*WOL.*设备/)).toBeInTheDocument();
  });

  it('同一设备被引用多次 → 去重', () => {
    renderSummary(
      [deviceAction(100), deviceAction(100), deviceAction(100)],
      [wolDevEnabled],
    );
    const rows = screen.getAllByText('PC 一号');
    expect(rows).toHaveLength(1);
    expect(screen.getByText(/1.*台.*WOL.*设备/)).toBeInTheDocument();
  });

  it('跳转链接带 ?openEdit={id}', () => {
    renderSummary([deviceAction(100)], [wolDevEnabled]);
    const link = screen.getByText(/跳转编辑设备/).closest('a');
    expect(link?.getAttribute('href')).toBe('/devices?openEdit=100');
  });

  it('content 类 action 不计入 WOL 引用', () => {
    const contentAction = {
      type: 'content',
      delay_ms: 0,
      delay_seconds_after_prev_start: 0,
      preconditions: [],
      exhibit_id: 1,
      content_intent: 'play',
    } as unknown as ActionStep;
    const { container } = renderSummary([contentAction], [wolDevEnabled]);
    expect(container.firstChild).toBeNull();
  });

  it('preset 设备 (非 protocol=wol) 即使被引用也不显示', () => {
    const { container } = renderSummary([deviceAction(201)], [presetDev]);
    expect(container.firstChild).toBeNull();
  });
});
