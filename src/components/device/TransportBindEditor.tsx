/**
 * device-mgmt-v2 P6 — 6 套 transport bind 字段编辑器
 *
 * 复用于：
 *   - raw_transport device 的 connection_config（设备级）
 *   - listener trigger 的 source.bind（触发器级）
 *
 * 6 套字段表（PRD-v2 §九 + P5 TriggerModels.cs 对齐）：
 *   tcp/udp:  port, host, local_interface(可选), broadcast(仅 udp 可选)
 *   serial:   com, baudrate, parity, data_bits, stop_bits, frame_gap_ms
 *   osc:      port
 *   artnet:   universe
 *   modbus:   host, port=502, unit_id=1, register, function_code=3, poll_interval_ms=200, quantity=1
 *
 * ADR-0017 D4：UDP/TCP 增加 local_interface（可选源网卡 IP）+ UDP broadcast
 * checkbox；如父层传 exhibitId/hallId，按钮 [获取展厅 App 网卡列表] 调
 * /api/v1/exhibits/:id/diag/network/interfaces 透传，下拉选 IP。
 */
import { useState } from 'react';
import {
  Button,
  Checkbox,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useMessage } from '@/hooks/useMessage';
import { diagApi } from '@/api/diag';
import type { TransportKind } from '@/types/deviceConnector';

interface Props {
  transport: TransportKind;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** 用于 [获取展厅 App 网卡列表] 透传；不传时按钮隐藏 */
  hallId?: number;
  exhibitId?: number | null;
}

const { Text } = Typography;

function shouldSuggestBroadcast(host?: string): boolean {
  if (!host) return false;
  const trimmed = host.trim();
  if (trimmed === '255.255.255.255') return true;
  return /\.255$/.test(trimmed);
}

export default function TransportBindEditor({
  transport,
  value,
  onChange,
  hallId,
  exhibitId,
}: Props) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const { message, modal } = useMessage();
  const [ifaceMenu, setIfaceMenu] = useState<MenuProps['items']>([]);
  const canFetchIfaces =
    typeof hallId === 'number' &&
    hallId > 0 &&
    typeof exhibitId === 'number' &&
    exhibitId > 0;

  const fetchIfacesMutation = useMutation({
    mutationFn: () => diagApi.networkInterfaces(hallId!, exhibitId!),
    onSuccess: (res) => {
      const list = res.data.data?.interfaces ?? [];
      const items: MenuProps['items'] = [];
      list.forEach((nic, idx) => {
        if (idx > 0) items.push({ type: 'divider' });
        items.push({
          key: `header-${idx}`,
          disabled: true,
          label: (
            <Text style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
              {nic.name} {nic.description ? `· ${nic.description}` : ''}
            </Text>
          ),
        });
        nic.ipv4.forEach((addr) => {
          items.push({
            key: `${idx}-${addr.ip}`,
            label: (
              <Space size={6}>
                <Text code style={{ fontSize: 12 }}>
                  {addr.ip}
                </Text>
                {addr.broadcast && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    bcast {addr.broadcast}
                  </Text>
                )}
              </Space>
            ),
            onClick: () => set('local_interface', addr.ip),
          });
        });
      });
      if (items.length === 0) {
        message.warning('展厅 App 未返回可用 IPv4 网卡');
      }
      setIfaceMenu(items);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '调用失败';
      message.error(`获取网卡列表失败：${msg}（确认展厅 App 在线 + 9900 端点已升级）`);
    },
  });

  const handleBroadcastChange = (checked: boolean) => {
    if (checked) {
      modal.confirm({
        title: '确认启用 UDP 广播？',
        content: '广播将发送到子网所有设备，请确认目标网段已隔离 / 不会误触其他设备。',
        okText: '确认启用',
        cancelText: '取消',
        onOk: () => set('broadcast', true),
      });
    } else {
      set('broadcast', false);
    }
  };

  const renderInterfaceField = () => (
    <Form.Item
      label="本地网卡 IP"
      extra="可选 · 留空 = OS 路由（多网卡建议显式填）"
    >
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={(value.local_interface as string | undefined) ?? ''}
          onChange={(e) => set('local_interface', e.target.value || undefined)}
          placeholder="192.168.50.74"
          allowClear
        />
        {canFetchIfaces && (
          <Dropdown
            menu={{ items: ifaceMenu ?? [] }}
            trigger={['click']}
            disabled={fetchIfacesMutation.isPending}
            onOpenChange={(open) => {
              if (open && (ifaceMenu?.length ?? 0) === 0) {
                fetchIfacesMutation.mutate();
              }
            }}
          >
            <Button>
              {fetchIfacesMutation.isPending ? <Spin size="small" /> : '获取展厅 App 网卡列表'}
            </Button>
          </Dropdown>
        )}
      </Space.Compact>
    </Form.Item>
  );

  switch (transport) {
    case 'tcp':
    case 'udp':
      return (
        <>
          <Form.Item label="设备 IP" required>
            <Input
              value={value.host as string | undefined}
              onChange={(e) => set('host', e.target.value)}
              placeholder={
                transport === 'udp'
                  ? '192.168.x.x / 127.0.0.1 / 192.168.x.255 / 255.255.255.255'
                  : '192.168.1.10'
              }
            />
          </Form.Item>
          <Form.Item label="端口" required>
            <InputNumber
              value={value.port as number | undefined}
              onChange={(v) => set('port', v)}
              min={1}
              max={65535}
              style={{ width: '100%' }}
              placeholder="2000"
            />
          </Form.Item>
          {renderInterfaceField()}
          {transport === 'udp' && (
            <Form.Item
              label="广播"
              extra={
                shouldSuggestBroadcast(value.host as string | undefined) && !value.broadcast
                  ? '检测到 host 末尾 .255 / 255.255.255.255，建议勾选 SO_BROADCAST'
                  : 'UDP 专用 · 启用 SO_BROADCAST'
              }
            >
              <Checkbox
                checked={!!value.broadcast}
                onChange={(e) => handleBroadcastChange(e.target.checked)}
              >
                启用 SO_BROADCAST
              </Checkbox>
            </Form.Item>
          )}
        </>
      );
    case 'osc':
      return (
        <Form.Item label="OSC 端口" required>
          <InputNumber
            value={value.port as number | undefined}
            onChange={(v) => set('port', v)}
            min={1}
            max={65535}
            style={{ width: '100%' }}
            placeholder="8000"
          />
        </Form.Item>
      );
    case 'artnet':
      return (
        <Form.Item
          label="DMX universe 编号"
          required
          extra="Art-Net 监听 UDP 6454 端口，按 universe 过滤"
        >
          <InputNumber
            value={value.universe as number | undefined}
            onChange={(v) => set('universe', v)}
            min={0}
            max={32767}
            style={{ width: '100%' }}
            placeholder="1"
          />
        </Form.Item>
      );
    case 'serial':
      return (
        <>
          <Form.Item label="串口路径" required extra="Mac/Linux 形如 /dev/cu.usbserial-1；Windows 形如 COM3">
            <Input
              value={value.com as string | undefined}
              onChange={(e) => set('com', e.target.value)}
              placeholder="/dev/cu.usbserial-1 或 COM3"
            />
          </Form.Item>
          <Form.Item label="波特率">
            <InputNumber
              value={(value.baudrate as number | undefined) ?? 9600}
              onChange={(v) => set('baudrate', v)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
              高级（校验位 / 数据位 / 停止位 / 帧间隔）
            </summary>
            <div style={{ marginTop: 12 }}>
              <Form.Item label="校验位">
                <Select
                  value={(value.parity as string | undefined) ?? 'none'}
                  onChange={(v) => set('parity', v)}
                  options={[
                    { value: 'none', label: '无' },
                    { value: 'even', label: '偶' },
                    { value: 'odd', label: '奇' },
                    { value: 'mark', label: 'mark' },
                    { value: 'space', label: 'space' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="数据位">
                <InputNumber
                  value={(value.data_bits as number | undefined) ?? 8}
                  onChange={(v) => set('data_bits', v)}
                  min={5}
                  max={8}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="停止位">
                <Select
                  value={(value.stop_bits as number | undefined) ?? 1}
                  onChange={(v) => set('stop_bits', v)}
                  options={[
                    { value: 0, label: '0' },
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="帧间隔（毫秒）">
                <InputNumber
                  value={(value.frame_gap_ms as number | undefined) ?? 50}
                  onChange={(v) => set('frame_gap_ms', v)}
                  min={0}
                  max={5000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </details>
        </>
      );
    case 'modbus':
      return (
        <>
          <Form.Item label="设备 IP" required>
            <Input
              value={value.host as string | undefined}
              onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.1.20"
            />
          </Form.Item>
          <Form.Item label="端口">
            <InputNumber
              value={(value.port as number | undefined) ?? 502}
              onChange={(v) => set('port', v)}
              min={1}
              max={65535}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="设备地址 (unit id)">
            <InputNumber
              value={(value.unit_id as number | undefined) ?? 1}
              onChange={(v) => set('unit_id', v)}
              min={0}
              max={255}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="寄存器号" required>
            <InputNumber
              value={value.register as number | undefined}
              onChange={(v) => set('register', v)}
              min={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
              高级（功能码 / 轮询周期 / 读取数量）
            </summary>
            <div style={{ marginTop: 12 }}>
              <Form.Item label="功能码">
                <InputNumber
                  value={(value.function_code as number | undefined) ?? 3}
                  onChange={(v) => set('function_code', v)}
                  min={1}
                  max={255}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="轮询周期 (ms)">
                <InputNumber
                  value={(value.poll_interval_ms as number | undefined) ?? 200}
                  onChange={(v) => set('poll_interval_ms', v)}
                  min={10}
                  max={60000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item label="读取数量">
                <InputNumber
                  value={(value.quantity as number | undefined) ?? 1}
                  onChange={(v) => set('quantity', v)}
                  min={1}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </div>
          </details>
        </>
      );
    default:
      return <span>不支持的连接方式</span>;
  }
}
