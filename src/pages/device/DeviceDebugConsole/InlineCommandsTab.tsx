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
  prepareInlineCommandsForSave,
  validateInlineCommands,
  type InlineCommandRow,
} from '@/components/device/InlineCommandsTable';
import {
  isInlineCommandReferencedError,
  showInlineCommandReferencedModal,
} from '@/components/device/showInlineCommandReferencedModal';
import { useInlineCommandCodeAutogenEnabled } from '@/components/device/useInlineCommandCodeAutogenEnabled';
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

  const autogenEnabled = useInlineCommandCodeAutogenEnabled();
  const dirty = !rowsEqual(rows, baseline);
  const issues = useMemo(
    () => validateInlineCommands(rows, { autogenEnabled }),
    [rows, autogenEnabled],
  );
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

  /** 已持久化行 key 集合：baseline 里有此 _row 且 code 非空（旧 code 不可改） */
  const persistedRowKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of baseline) {
      if (r._row && r.code) set.add(r._row);
    }
    return set;
  }, [baseline]);

  const saveMutation = useMutation({
    mutationFn: async (next: InlineCommandRow[]) => {
      // PRD-inline-command-code-autogen.md D2：保存前一次性把空 code 自动按名字生成
      // P4 feature flag 关闭时跳过 autogen，空 code 走 issues 回报
      const prepared = await prepareInlineCommandsForSave(next, { autogenEnabled });
      if (prepared.issues.length > 0) {
        throw new Error(prepared.issues[0].message);
      }
      const cleaned = prepared.rows.map(({ _row: _drop, ...rest }) => rest);
      // PUT /api/v1/devices/:id —— deviceV2Api.update 用 Partial<CreateDeviceV2Body>，
      // 直接透传 inline_commands 全量替换。后端按 connector_kind=raw_transport 分支处理。
      return deviceV2Api.update(deviceId, {
        inline_commands: cleaned,
      });
    },
    onSuccess: () => {
      message.success('命令清单已保存');
      queryClient.invalidateQueries({ queryKey: ['device-debug-bundle', deviceId] });
      // 演出时间线编辑器 ActionLibrary 用 effectiveCommands(deviceId)/devices({hall_id})
      // 走 ['devices', ...] 前缀；inline_commands 改完不刷新 → Bug 2 根因
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err: unknown) => {
      // PRD-inline-command-code-autogen P3.3：409 + INLINE_COMMAND_REFERENCED → 弹结构化 modal
      if (isInlineCommandReferencedError(err)) {
        showInlineCommandReferencedModal(modal, err.__inlineCommandReferenced);
        return;
      }
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
      message.error('自定义协议设备至少需要保留 1 条命令');
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
        <div style={{ fontWeight: 600 }}>命令清单</div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          自定义协议设备的命令在此就地编辑，支持每行 [▶ 测试] 即时验证
        </Text>
      </div>

      <InlineCommandsTable
        value={rows}
        onChange={setRows}
        onTest={handleTest}
        showLastTest
        dirtyRowKeys={dirtyRowKeys}
        persistedRowKeys={persistedRowKeys}
        autogenEnabled={autogenEnabled}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message={
          <span style={{ fontSize: 12 }}>
            <strong>测试发送</strong>会立即发到设备，不会保存到设备命令中（每秒最多 1 次）。
            未保存的行直接发送当前内容；已保存且未改动的行使用已存命令。
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
