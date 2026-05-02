/**
 * device-mgmt-v2 P-C（ADR-0017）— 调试台「命令清单」tab。
 *
 * 仅 raw_transport 设备显示。功能：
 *   - 行内编辑 inline_commands（共用 InlineCommandsTable）
 *   - 每行 [▶ 测试] → POST /v2/devices/:id/inline-commands/test（云端转发）
 *   - 整页 [保存全部] → PUT /api/v1/devices/:id 全量替换 inline_commands
 *   - dirty 状态指示 + [放弃改动]
 *
 * 数据来源：bundle.device.inline_commands（仅 raw_transport 后端会带）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMessage } from '@/hooks/useMessage';
import { deviceV2Api } from '@/api/deviceConnector';
import InlineCommandsTable, {
  ensureRowKey,
  validateInlineCommands,
  type InlineCommandRow,
} from '@/components/device/InlineCommandsTable';
import type { DeviceCommand } from '@/types/deviceConnector';

const { Text } = Typography;

interface Props {
  deviceId: number;
  initial: DeviceCommand[];
  onCountChange?: (count: number) => void;
}

function rowsEqual(a: InlineCommandRow[], b: InlineCommandRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      (x.code ?? '') !== (y.code ?? '') ||
      (x.name ?? '') !== (y.name ?? '') ||
      (x.kind ?? 'control') !== (y.kind ?? 'control') ||
      (x.request ?? '') !== (y.request ?? '') ||
      (x.request_format ?? 'text') !== (y.request_format ?? 'text')
    ) {
      return false;
    }
  }
  return true;
}

function withRowKeys(cmds: DeviceCommand[]): InlineCommandRow[] {
  return cmds.map((c, idx) => {
    const r: InlineCommandRow = { ...c };
    ensureRowKey(r, idx);
    return r;
  });
}

export default function InlineCommandsTab({ deviceId, initial, onCountChange }: Props) {
  const { message, modal } = useMessage();
  const queryClient = useQueryClient();

  // 把后端 cmds 转 row（带 _row key）；记录 baseline 用于 dirty 比较
  const [rows, setRows] = useState<InlineCommandRow[]>(() => withRowKeys(initial));
  const [baseline, setBaseline] = useState<InlineCommandRow[]>(() => withRowKeys(initial));

  // 后端 bundle 重拉时同步（保存成功 / 外部刷新）
  useEffect(() => {
    const fresh = withRowKeys(initial);
    setRows(fresh);
    setBaseline(fresh);
  }, [initial]);

  useEffect(() => {
    onCountChange?.(rows.length);
  }, [rows.length, onCountChange]);

  const dirty = !rowsEqual(rows, baseline);
  const issues = useMemo(() => validateInlineCommands(rows), [rows]);
  const dirtyRowKeys = useMemo(() => {
    const baseByKey = new Map(baseline.map((r) => [r._row, r]));
    const set = new Set<string>();
    rows.forEach((r) => {
      if (!r._row) return;
      const b = baseByKey.get(r._row);
      if (
        !b ||
        (r.code ?? '') !== (b.code ?? '') ||
        (r.name ?? '') !== (b.name ?? '') ||
        (r.kind ?? 'control') !== (b.kind ?? 'control') ||
        (r.request ?? '') !== (b.request ?? '') ||
        (r.request_format ?? 'text') !== (b.request_format ?? 'text')
      ) {
        set.add(r._row);
      }
    });
    return set;
  }, [rows, baseline]);

  const saveMutation = useMutation({
    mutationFn: async (next: InlineCommandRow[]) => {
      const cleaned = next.map(({ _row: _drop, ...rest }) => rest);
      // PUT /api/v1/devices/:id —— deviceV2Api.update 用 Partial<CreateDeviceV2Body>，
      // 直接透传 inline_commands 全量替换。后端按 connector_kind=raw_transport 分支处理。
      return deviceV2Api.update(deviceId, {
        inline_commands: cleaned,
      });
    },
    onSuccess: () => {
      message.success('命令清单已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '保存失败';
      message.error(`保存失败：${msg}`);
    },
  });

  const handleSaveAll = () => {
    if (issues.length > 0) {
      message.error(`命令清单有 ${issues.length} 处错误：${issues[0].message}`);
      return;
    }
    if (rows.length === 0) {
      message.error('raw_transport 设备至少要保留 1 条 inline_command');
      return;
    }
    saveMutation.mutate(rows);
  };

  const handleDiscard = () => {
    modal.confirm({
      title: '放弃所有未保存改动？',
      content: '将回到上次加载时的状态，已修改 / 新增 / 删除的行都会还原。',
      okText: '放弃改动',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      onOk: () => setRows(withRowKeys(baseline.map(({ _row, ...rest }) => rest))),
    });
  };

  const handleTest = async (row: InlineCommandRow) => {
    const start = Date.now();
    // dirty / 未保存的 row：走 ad-hoc payload；已存且未改动 → 走 command_code（ADR D3 二选一）
    const isPersistedAndClean = !!row._row && !dirtyRowKeys.has(row._row);
    const body = isPersistedAndClean
      ? { command_code: row.code ?? '' }
      : {
          payload: row.request ?? '',
          format: (row.request_format ?? 'text') as 'text' | 'hex',
        };
    const res = await deviceV2Api.testInlineCommand(deviceId, body);
    const data = res.data?.data;
    const ok = (data?.status ?? 'failed') !== 'failed';
    if (!ok) {
      throw new Error(data?.detail || `status=${data?.status ?? 'failed'}`);
    }
    return {
      ok,
      latencyMs: data?.latency_ms ?? Date.now() - start,
      detail: data?.detail,
      at: Date.now(),
    };
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600 }}>inline 命令清单</div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          raw_transport 设备的命令在此就地编辑，支持每行 [▶ 测试] 即时验证
        </Text>
      </div>

      <InlineCommandsTable
        value={rows}
        onChange={setRows}
        onTest={handleTest}
        showLastTest
        dirtyRowKeys={dirtyRowKeys}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message={
          <span style={{ fontSize: 12 }}>
            <strong>测试发送</strong>走云端转发到展厅 App，不持久化、不入 audit、1 QPS 限流。
            未保存的行用 ad-hoc payload 发送；已保存且未改动的行用 command_code 走已存命令。
          </span>
        }
      />

      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px dashed var(--ant-color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {dirty ? (
          <span
            style={{
              fontSize: 12,
              color: 'var(--ant-color-warning)',
              fontWeight: 500,
            }}
          >
            ● 有未保存改动（{dirtyRowKeys.size} 行已修改 / 新增 / 删除）
          </span>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ✓ 无未保存改动
          </Text>
        )}
        <span style={{ flex: 1 }} />
        <Space>
          <Button onClick={handleDiscard} disabled={!dirty || saveMutation.isPending}>
            放弃改动
          </Button>
          <Button
            type="primary"
            loading={saveMutation.isPending}
            disabled={!dirty || issues.length > 0}
            onClick={handleSaveAll}
          >
            保存全部
          </Button>
        </Space>
      </div>
    </div>
  );
}
