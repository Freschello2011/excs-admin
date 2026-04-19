import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, List, Button, Modal, Tag, Empty, Descriptions, Typography, Space,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { EditOutlined, ApiOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import CommandListEditor, {
  commandsToRows,
  normalizeCommands,
  type CommandRow,
} from '@/components/device-catalog/CommandListEditor';
import { deviceProtocolBaselineApi } from '@/api/deviceProtocolBaseline';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type {
  ProtocolBaselineListItemDTO,
  ProtocolBaselineDetailDTO,
  ProtocolCommand,
  ConnectionSchema,
} from '@/types/deviceProtocolBaseline';

const { Title, Paragraph, Text } = Typography;

/* ==================== 协议基线库页面 ====================
 * 路由：/platform/device-protocols
 * 左侧协议列表（11 个），右侧详情（连接 schema + 命令清单）。
 * 非 admin 只读；admin 可编辑命令清单（弹窗 + CommandListEditor）。
 */
export default function ProtocolBaselinePage() {
  const { message } = useMessage();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();

  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRows, setEditRows] = useState<CommandRow[]>([]);

  /* 列表 */
  const { data: list = [], isLoading: loadingList } = useQuery({
    queryKey: queryKeys.protocolBaselines,
    queryFn: () => deviceProtocolBaselineApi.list(),
    select: (res) => res.data.data,
  });

  /* 默认选中第一个（在 render 阶段派生，避免 setState in effect） */
  const activeProtocol = selectedProtocol || list[0]?.protocol || '';

  /* 详情 */
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: queryKeys.protocolBaselineDetail(activeProtocol),
    queryFn: () => deviceProtocolBaselineApi.get(activeProtocol),
    select: (res) => res.data.data,
    enabled: !!activeProtocol,
  });

  /* 编辑 mutation */
  const updateMutation = useMutation({
    mutationFn: ({ protocol, commands }: { protocol: string; commands: ProtocolCommand[] }) =>
      deviceProtocolBaselineApi.update(protocol, { commands }),
    onSuccess: () => {
      message.success('命令清单已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.protocolBaselines });
      queryClient.invalidateQueries({ queryKey: queryKeys.protocolBaselineDetail(activeProtocol) });
      setEditOpen(false);
    },
    onError: (err: Error) => message.error(err.message || '更新失败'),
  });

  const openEdit = () => {
    if (!detail) return;
    setEditRows(commandsToRows(detail.commands));
    setEditOpen(true);
  };

  const handleSubmit = () => {
    try {
      const cmds = normalizeCommands(editRows);
      updateMutation.mutate({ protocol: activeProtocol, commands: cmds });
    } catch {
      /* normalizeCommands 已 message.error */
    }
  };

  return (
    <div>
      <PageHeader
        description="平台级协议命令基线库 — 各协议（PJLink / Modbus / K32 / Smyoo 等）的连接参数 Schema 与标准命令集，作为型号库的继承底座。"
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左侧：协议列表 */}
        <Card
          size="small"
          title={<span><ApiOutlined /> 协议列表</span>}
          style={{ width: 280, flexShrink: 0 }}
          styles={{ body: { padding: 0 } }}
          loading={loadingList}
        >
          <List
            dataSource={list}
            locale={{ emptyText: <Empty description="暂无协议基线" /> }}
            renderItem={(item: ProtocolBaselineListItemDTO) => {
              const active = item.protocol === activeProtocol;
              return (
                <List.Item
                  onClick={() => setSelectedProtocol(item.protocol)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 16px',
                    background: active ? 'var(--ant-color-primary-bg)' : undefined,
                    borderLeft: active ? '3px solid var(--ant-color-primary)' : '3px solid transparent',
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text strong>{item.name}</Text>
                      <Tag>{item.command_count} 命令</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.protocol}</Text>
                  </div>
                </List.Item>
              );
            }}
          />
        </Card>

        {/* 右侧：详情 */}
        <Card
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          title={detail ? <span>{detail.name} <Tag>{detail.protocol}</Tag></span> : '协议详情'}
          extra={
            isAdmin() && detail ? (
              <Button type="primary" icon={<EditOutlined />} onClick={openEdit}>
                编辑命令清单
              </Button>
            ) : null
          }
          loading={loadingDetail}
        >
          {!detail ? (
            <Empty description="请选择左侧协议" />
          ) : (
            <ProtocolDetailView detail={detail} />
          )}
        </Card>
      </div>

      <Modal
        title={detail ? `编辑命令清单 — ${detail.name}` : '编辑命令清单'}
        open={editOpen}
        onOk={handleSubmit}
        onCancel={() => setEditOpen(false)}
        confirmLoading={updateMutation.isPending}
        width={760}
        destroyOnClose
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          编辑后，所有继承该协议的型号若未声明同名命令将立刻继承变更。请谨慎操作。
        </Paragraph>
        <CommandListEditor value={editRows} onChange={setEditRows} />
      </Modal>
    </div>
  );
}

/* ==================== 详情视图 ==================== */

function ProtocolDetailView({ detail }: { detail: ProtocolBaselineDetailDTO }) {
  const schemaProps = useMemo(() => extractSchemaProps(detail.connection_schema), [detail.connection_schema]);

  return (
    <div>
      {detail.notes && (
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>{detail.notes}</Paragraph>
      )}

      <Title level={5} style={{ marginTop: 0 }}>连接参数 Schema</Title>
      {schemaProps.length === 0 ? (
        <Text type="secondary">该协议无连接参数</Text>
      ) : (
        <Descriptions size="small" column={1} bordered styles={{ label: { width: 200 } }}>
          {schemaProps.map((p) => (
            <Descriptions.Item key={p.key} label={
              <span>
                {p.title || p.key}
                {p.required && <Text type="danger" style={{ marginLeft: 4 }}>*</Text>}
              </span>
            }>
              <Space size="small" wrap>
                <Tag>{p.key}</Tag>
                <Tag color="blue">{p.type}</Tag>
                {p.widget && <Tag color="purple">widget: {p.widget}</Tag>}
                {p.default !== undefined && <Tag color="default">default: {String(p.default)}</Tag>}
                {p.enum && <Tag color="cyan">enum: {p.enum.join(' / ')}</Tag>}
              </Space>
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}

      <Title level={5} style={{ marginTop: 24 }}>命令清单（{detail.commands.length}）</Title>
      {detail.commands.length === 0 ? (
        <Text type="secondary">该协议无标准命令（型号需自定义）</Text>
      ) : (
        <CommandListEditor value={commandsToRows(detail.commands)} onChange={() => {}} readOnly />
      )}
    </div>
  );
}

/* ==================== Helpers ==================== */

interface SchemaProp {
  key: string;
  type: string;
  title?: string;
  widget?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
}

function extractSchemaProps(schema: ConnectionSchema | undefined | null): SchemaProp[] {
  if (!schema || typeof schema !== 'object') return [];
  const props = (schema as Record<string, unknown>).properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return [];
  const requiredArr = ((schema as Record<string, unknown>).required as string[] | undefined) || [];
  return Object.entries(props).map(([key, def]) => ({
    key,
    type: (def.type as string) || 'unknown',
    title: def.title as string | undefined,
    widget: def.widget as string | undefined,
    default: def.default,
    required: requiredArr.includes(key),
    enum: def.enum as unknown[] | undefined,
  }));
}
