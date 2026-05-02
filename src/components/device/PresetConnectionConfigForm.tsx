/**
 * device-mgmt-v2 P9-B 前端补齐：闪优 preset connection_schema 自定义渲染。
 *
 * 设计：preset 选中后不再走 TransportBindEditor（那个给 raw_transport 用），改为读
 * preset.connection_schema 的 properties + widget 字段动态渲染。
 *
 * 自定义 widget 支持：
 *   - widget=vendor-credential-select → 拉 GET /v2/vendor-credentials?vendor_key=<schema.vendor_key>
 *     渲染下拉 + 自动选第一条 + 蓝色提示卡（已自动选用 / BpeSessionId 状态 chip）
 *   - 字段名 deviceid → 文本框 + [📋 粘贴] + [🔗 在线验证] 按钮
 *
 * 验证流程：admin 点 [🔗 在线验证] → POST /v2/devices/_test_smyoo_mcuid → 绿卡显示
 *   ✓ 验证通过 · isonline / channelnum / romversion / mcuname
 * 失败时红卡显示 message。验证仅诊断用，不影响保存（也不需要保存前必须验证通过）。
 *
 * 通用字段（无 widget）按 type 退化：number/integer → InputNumber；string → Input。
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Select, Space, Tag, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { vendorCredentialApi, type SmyooMcuidTestResponse } from '@/api/vendorCredential';

interface ConnSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  widget?: string;
  vendor_key?: string;
  minimum?: number;
  maximum?: number;
}

interface ConnSchemaShape {
  type?: string;
  required?: string[];
  properties?: Record<string, ConnSchemaProperty>;
}

export interface PresetConnectionConfigFormProps {
  /** preset.connection_schema 原始 yaml-derived 对象 */
  schema: Record<string, unknown>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export default function PresetConnectionConfigForm({
  schema,
  value,
  onChange,
}: PresetConnectionConfigFormProps) {
  const s = schema as ConnSchemaShape;
  const props = s.properties ?? {};
  const requiredSet = useMemo(() => new Set(s.required ?? []), [s.required]);
  const keys = Object.keys(props);

  if (keys.length === 0) {
    return <div style={{ color: 'var(--ant-color-text-tertiary)' }}>该型号无连接参数</div>;
  }

  return (
    <Form layout="vertical">
      {keys.map((k) => {
        const p = props[k] ?? {};
        const required = requiredSet.has(k);
        return (
          <PresetField
            key={k}
            fieldKey={k}
            schema={p}
            required={required}
            value={value}
            onChange={onChange}
          />
        );
      })}
    </Form>
  );
}

function PresetField({
  fieldKey,
  schema,
  required,
  value,
  onChange,
}: {
  fieldKey: string;
  schema: ConnSchemaProperty;
  required: boolean;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const widget = schema.widget;

  if (widget === 'vendor-credential-select') {
    return (
      <VendorCredentialSelect
        fieldKey={fieldKey}
        schema={schema}
        required={required}
        value={value}
        onChange={onChange}
      />
    );
  }

  // 字段名 deviceid 或 mcuid → 给特殊编辑器（带 [粘贴] + [在线验证]）
  if (fieldKey === 'deviceid' || fieldKey === 'mcuid') {
    return (
      <DeviceIdField
        fieldKey={fieldKey}
        schema={schema}
        required={required}
        value={value}
        onChange={onChange}
      />
    );
  }

  // 退化通用渲染
  const label = schema.title ?? fieldKey;
  const help = schema.description;
  if (schema.type === 'number' || schema.type === 'integer') {
    return (
      <Form.Item label={label} required={required} help={help}>
        <InputNumber
          value={(value[fieldKey] as number | undefined) ?? (schema.default as number | undefined)}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(v) => onChange({ ...value, [fieldKey]: v ?? undefined })}
          style={{ width: '100%' }}
        />
      </Form.Item>
    );
  }
  return (
    <Form.Item label={label} required={required} help={help}>
      <Input
        value={(value[fieldKey] as string | undefined) ?? (schema.default as string | undefined) ?? ''}
        onChange={(e) => onChange({ ...value, [fieldKey]: e.target.value })}
      />
    </Form.Item>
  );
}

/* =============== widget=vendor-credential-select =============== */

function VendorCredentialSelect({
  fieldKey,
  schema,
  required,
  value,
  onChange,
}: {
  fieldKey: string;
  schema: ConnSchemaProperty;
  required: boolean;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const vendorKey = schema.vendor_key ?? 'smyoo';

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['vendor-credentials', vendorKey],
    queryFn: () => vendorCredentialApi.list(vendorKey),
    select: (res) => res.data.data ?? [],
  });

  const current = (value[fieldKey] as number | undefined) ?? null;

  // 首次默认选第一条（admin 可改）
  useEffect(() => {
    if (current == null && list.length > 0) {
      onChange({ ...value, [fieldKey]: list[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const selected = list.find((c) => c.id === current) ?? null;

  if (!isLoading && list.length === 0) {
    return (
      <Form.Item label={schema.title ?? fieldKey} required={required}>
        <Alert
          type="warning"
          showIcon
          message={`尚无 vendor_key=${vendorKey} 的厂家凭据`}
          description={
            <span>
              到{' '}
              <a href="/platform/device-catalog" target="_blank" rel="noreferrer">
                平台数据配置 → 设备目录 → 厂家凭据
              </a>{' '}
              新建一条，再回这里选择。
            </span>
          }
        />
      </Form.Item>
    );
  }

  return (
    <Form.Item
      label={schema.title ?? '厂家账号'}
      required={required}
      help={schema.description}
    >
      <Select
        loading={isLoading}
        value={current ?? undefined}
        onChange={(v) => onChange({ ...value, [fieldKey]: v })}
        placeholder="选择厂家凭据"
        options={list.map((c) => ({
          value: c.id,
          label: `${c.label}${c.phone_masked ? ` · ${c.phone_masked}` : ''}${c.complete ? '' : ' · ⚠ 缺字段'}`,
        }))}
      />
      {selected && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 12px',
            background: 'var(--ant-color-info-bg)',
            border: '1px solid var(--ant-color-info-border)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12.5,
          }}
        >
          <span style={{ fontSize: 16 }}>🔐</span>
          <div style={{ flex: 1, lineHeight: 1.5 }}>
            <strong>已自动选用「{selected.label}」</strong>
            {' · '}
            来源{' '}
            <a href="/platform/device-catalog" target="_blank" rel="noreferrer">
              平台数据配置 → 厂家凭据
            </a>
            {' · '}phone/password 加密存储，不在本表单显示
          </div>
          <Tooltip title="BpeSessionId 由 SmyooPlugin 在调用 setchannel/getmcuinfo 时按需建立；本表单看不到 token，只能在「设备调试台 → 闪优凭据卡 → 立即刷新 ticket」强制重登。">
            <Tag color={selected.complete ? 'success' : 'warning'} style={{ margin: 0 }}>
              {selected.complete ? '✓ 凭据齐全' : '⚠ 缺字段'}
            </Tag>
          </Tooltip>
        </div>
      )}
    </Form.Item>
  );
}

/* =============== fieldKey=deviceid（mcuid 别名同处理）=============== */

function DeviceIdField({
  fieldKey,
  schema,
  required,
  value,
  onChange,
}: {
  fieldKey: string;
  schema: ConnSchemaProperty;
  required: boolean;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const { message } = useMessage();
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    | { ok: true; data: SmyooMcuidTestResponse }
    | { ok: false; message: string; latency_ms?: number }
    | null
  >(null);

  const fieldValue = (value[fieldKey] as string | undefined) ?? '';
  const credentialId = (value['vendor_credential_id'] as number | undefined) ?? null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed) {
        message.warning('剪贴板为空');
        return;
      }
      onChange({ ...value, [fieldKey]: trimmed });
      message.success('已粘贴');
    } catch {
      message.error('剪贴板不可读，浏览器可能拒绝了授权');
    }
  };

  const handleVerify = async () => {
    if (!fieldValue) {
      message.warning('请先填 deviceid（mcuid）');
      return;
    }
    if (!credentialId) {
      message.warning('请先选厂家账号');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await vendorCredentialApi.testSmyooMcuid({
        vendor_credential_id: credentialId,
        deviceid: fieldValue,
      });
      if (res.data.code !== 0) {
        setVerifyResult({
          ok: false,
          message: res.data.message || '验证失败',
          latency_ms: res.data.data?.latency_ms,
        });
      } else {
        setVerifyResult({ ok: true, data: res.data.data });
        // 把验证拿到的 channelnum 自动写入 connection_config.max_channel —— 闪优 4G
        // 系列只有通道数差异（6ch/16ch/...），其他控制方式一致；admin 选 16ch preset 但
        // 实际硬件可能是 6ch。connection_config.max_channel 优先级高于 preset.base_channel
        // （resolveMaxChannel 已实现），落库后调试台 / channel_map / 命令 channel 校验
        // 全部按真实通道数走，不需要再为每种通道数单独建 preset。
        if (res.data.data?.channelnum && res.data.data.channelnum > 0) {
          onChange({ ...value, [fieldKey]: fieldValue, max_channel: res.data.data.channelnum });
        }
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      setVerifyResult({
        ok: false,
        message: e.response?.data?.message || (err instanceof Error ? err.message : '验证请求失败'),
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Form.Item
      label={schema.title ?? '设备 ID（mcuid）'}
      required={required}
      help={schema.description}
    >
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={fieldValue}
          onChange={(e) => {
            onChange({ ...value, [fieldKey]: e.target.value });
            setVerifyResult(null);
          }}
          placeholder="32 位 hex 串，模块自带"
          style={{ fontFamily: 'var(--font-family-mono, ui-monospace, monospace)' }}
        />
        <Button onClick={handlePaste}>📋 粘贴</Button>
        <Button type="primary" loading={verifying} onClick={handleVerify}>
          🔗 在线验证
        </Button>
      </Space.Compact>
      {verifyResult?.ok && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 12px',
            background: 'var(--ant-color-success-bg)',
            border: '1px solid var(--ant-color-success-border)',
            borderRadius: 6,
            color: 'var(--ant-color-success-text)',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 16 }}>✓</span>
          <strong>验证通过</strong>
          <span>· isonline={verifyResult.data.isonline ? 1 : 0}</span>
          {verifyResult.data.channelnum != null && (
            <span>· channelnum={verifyResult.data.channelnum}</span>
          )}
          {verifyResult.data.romversion && <span>· romversion={verifyResult.data.romversion}</span>}
          {verifyResult.data.mcuname && (
            <span>
              · mcuname=<code>{verifyResult.data.mcuname}</code>
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11 }}>
            耗时 {verifyResult.data.latency_ms}ms
          </span>
        </div>
      )}
      {verifyResult && !verifyResult.ok && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 12px',
            background: 'var(--ant-color-error-bg)',
            border: '1px solid var(--ant-color-error-border)',
            borderRadius: 6,
            color: 'var(--ant-color-error-text)',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>✕</span>
          <strong>验证失败</strong>
          <span style={{ flex: 1 }}>· {verifyResult.message}</span>
          {verifyResult.latency_ms != null && (
            <span style={{ fontSize: 11 }}>耗时 {verifyResult.latency_ms}ms</span>
          )}
        </div>
      )}
    </Form.Item>
  );
}
