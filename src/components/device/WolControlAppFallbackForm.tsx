/**
 * WOL 中控 App 兜底配置（ADR-0029）—— 设备级配置子表单。
 *
 * 渲染在 ConnectionConfigForKind 中 protocol=wol 设备的 SchemaConfigForm 之下。
 * 数据落 device.connection_config.control_app_fallback；不入 panel_card binding。
 *
 * 4 个字段：
 *   - enabled            默认 false；admin 显式开
 *   - require_lan_sanity 默认 true；要求中控 IP 命中 hall.expected_subnets
 *   - subnet_broadcast   优先级高于顶层 broadcast；空则用顶层
 *   - platform_blocklist 多选；["ios"] 在 multicast entitlement 被驳后使用
 */
import { Card, Form, Switch, Input, Select, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

export interface WolControlAppFallback {
  enabled?: boolean;
  require_lan_sanity?: boolean;
  subnet_broadcast?: string;
  platform_blocklist?: string[];
}

const PLATFORM_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'macos', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
];

interface Props {
  value?: WolControlAppFallback;
  onChange?: (v: WolControlAppFallback) => void;
  disabled?: boolean;
}

export default function WolControlAppFallbackForm({ value, onChange, disabled }: Props) {
  const v: WolControlAppFallback = value ?? {};
  const update = (patch: Partial<WolControlAppFallback>) =>
    onChange?.({ ...v, ...patch });

  return (
    <Card
      size="small"
      title={
        <span>
          ⚡ 兜底唤醒（中控 App 本地）{' '}
          <Tooltip title="ADR-0029：当展厅所有展厅 App 关机（hall_master 不可达）时，由展厅 LAN 中的中控 App 本地 UDP 广播 magic packet。配置数据落于 device.connection_config.control_app_fallback。">
            <InfoCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />
          </Tooltip>
        </span>
      }
      style={{ marginTop: 12 }}
    >
      <Form layout="vertical" disabled={disabled}>
        <Form.Item
          label="启用兜底（默认关闭）"
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              开启后：当 hall_master 不可达时，server 把 envelope 改 lan_local 发给中控 App
              本地广播。需配套展厅设置中的「展厅子网」+ 中控 App 升级到支持版本。
            </Typography.Text>
          }
        >
          <Switch
            checked={!!v.enabled}
            onChange={(checked) => update({ enabled: checked })}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </Form.Item>

        {v.enabled && (
          <>
            <Form.Item
              label="要求中控处于展厅 LAN（推荐开启）"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  开启时中控 IP 必须命中展厅设置中配置的 expected_subnets 才会被选作 actor；
                  关闭则允许「弱判定 / 退化模式」（仅看到 mDNS 即放行）。运营在外网点 WOL
                  时强烈建议开启避免误判。
                </Typography.Text>
              }
            >
              <Switch
                checked={v.require_lan_sanity !== false}
                onChange={(checked) => update({ require_lan_sanity: checked })}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Form.Item>

            <Form.Item
              label="子网广播地址"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  优先级高于顶层 broadcast；空则用顶层。多 NIC / VPN 场景必填，避免 OS
                  把广播包路由错网卡。例：<Typography.Text code>192.168.50.255</Typography.Text>
                </Typography.Text>
              }
            >
              <Input
                value={v.subnet_broadcast ?? ''}
                onChange={(e) => update({ subnet_broadcast: e.target.value })}
                placeholder="留空 = 用顶层 broadcast"
              />
            </Form.Item>

            <Form.Item
              label="禁用平台（黑名单）"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  对此设备不允许哪些平台的中控 App 兜底。Apple multicast entitlement
                  被驳时勾选 iOS。
                </Typography.Text>
              }
            >
              <Select
                mode="multiple"
                value={v.platform_blocklist ?? []}
                onChange={(arr) => update({ platform_blocklist: arr })}
                options={PLATFORM_OPTIONS}
                placeholder="未选 = 允许全部平台"
                allowClear
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Card>
  );
}
