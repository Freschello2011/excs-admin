import { useState } from 'react';
import {
  Drawer,
  Tabs,
  List,
  Tag,
  Space,
  Button,
  Modal,
  Input,
  Tooltip,
  Empty,
  Spin,
  Pagination,
  Form,
} from 'antd';
import {
  EyeOutlined,
  RocketOutlined,
  EditOutlined,
  DeleteOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMessage } from '@/hooks/useMessage';
import { panelApi } from '@/api/panel';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import type {
  PanelVersionDTO,
  PanelVersionStatus,
  PanelVersionDetailDTO,
  PanelSnapshot,
} from '@/api/gen/client';

interface Props {
  open: boolean;
  onClose: () => void;
  hallId: number;
  /** 当前生效版本 id（用于在列表里高亮 ★） */
  currentVersionId?: number | null;
  /** 「查看」按钮回调：把指定 snapshot 喂给只读 PanelPreview。 */
  onView?: (version: PanelVersionDetailDTO) => void;
  /** 发布成功后回调 */
  onPublished?: (versionId: number) => void;
}

const STATUS_TABS: Array<{ key: 'all' | PanelVersionStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'published', label: '已发布' },
  { key: 'archived', label: '已归档' },
];

const STATUS_BADGE: Record<PanelVersionStatus, { color: string; text: string }> = {
  draft: { color: 'gold', text: '草稿' },
  published: { color: 'green', text: '已发布' },
  archived: { color: 'default', text: '已归档' },
};

export default function PanelVersionDrawer({
  open,
  onClose,
  hallId,
  currentVersionId,
  onView,
  onPublished,
}: Props) {
  const { message, modal } = useMessage();
  const queryClient = useQueryClient();
  const canEdit = useCan('panel.edit', { type: 'hall', id: String(hallId) });
  const canPublish = useCan('panel.publish', { type: 'hall', id: String(hallId) });

  const [activeTab, setActiveTab] = useState<'all' | PanelVersionStatus>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const queryParams = {
    status: activeTab === 'all' ? undefined : activeTab,
    page,
    page_size: pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.panelVersions(hallId, queryParams),
    queryFn: () => panelApi.listVersions(hallId, queryParams),
    select: (res) => res.data.data,
    enabled: open && !!hallId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['panel', hallId] });

  const renameMutation = useMutation({
    mutationFn: (args: { versionId: number; name: string }) =>
      panelApi.renameVersion(hallId, args.versionId, { name: args.name }),
    onSuccess: () => {
      message.success('已改名');
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (versionId: number) => panelApi.deleteVersion(hallId, versionId),
    onSuccess: () => {
      message.success('已删除');
      invalidate();
    },
  });

  const publishMutation = useMutation({
    mutationFn: (versionId: number) => panelApi.publishVersion(hallId, versionId),
    onSuccess: (res, versionId) => {
      const broadcastSent = res.data.data?.broadcast_sent;
      message.success(`已发布${broadcastSent === false ? '（MQTT 广播失败，请检查中控 App 在线状态）' : ''}`);
      invalidate();
      onPublished?.(versionId);
    },
  });

  /* ─── 改名对话框 ─── */
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PanelVersionDTO | null>(null);
  const [renameForm] = Form.useForm();

  const openRename = (v: PanelVersionDTO) => {
    setRenameTarget(v);
    renameForm.setFieldsValue({ name: v.name });
    setRenameOpen(true);
  };

  const handleRenameSubmit = () => {
    renameForm.validateFields().then((values) => {
      if (!renameTarget) return;
      renameMutation.mutate(
        { versionId: renameTarget.id, name: values.name },
        { onSuccess: () => setRenameOpen(false) },
      );
    });
  };

  /* ─── 查看（拉详情 + 委托给父组件渲染只读 PanelPreview）─── */
  const handleView = async (v: PanelVersionDTO) => {
    try {
      const res = await panelApi.getVersion(hallId, v.id);
      const detail = res.data.data;
      onView?.(detail);
    } catch {
      // axios 拦截器已弹 message.error
    }
  };

  /* ─── 发布 / 回滚 二次确认 ─── */
  const confirmPublish = (v: PanelVersionDTO) => {
    const isRollback = v.status === 'archived';
    modal.confirm({
      title: isRollback ? '确认回滚到该版本？' : '确认发布该版本？',
      content: (
        <div>
          <div>
            版本：<strong>{v.name}</strong>
          </div>
          <div style={{ marginTop: 8, color: 'var(--ant-color-text-secondary)' }}>
            {isRollback
              ? '回滚 = 把该已归档版本重新发布一次。所有在线中控 App 会弹窗"是否更新"。'
              : '发布后，所有在线中控 App 会弹窗"是否更新"，新打开的 App 直接拉新配置。'}
          </div>
        </div>
      ),
      okText: isRollback ? '回滚发布' : '发布',
      okButtonProps: { danger: isRollback },
      onOk: () => publishMutation.mutateAsync(v.id),
    });
  };

  const confirmDelete = (v: PanelVersionDTO) => {
    modal.confirm({
      title: '确认删除该草稿？',
      content: `版本：${v.name}（删除后无法恢复，但仅删 draft；published / archived 不可删）。`,
      okText: '删除',
      okType: 'danger',
      onOk: () => deleteMutation.mutateAsync(v.id),
    });
  };

  return (
    <Drawer
      title="面板版本"
      open={open}
      onClose={onClose}
      width={460}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k as typeof activeTab);
          setPage(1);
        }}
        items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
        size="small"
      />

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : !data || data.list.length === 0 ? (
        <Empty description="暂无版本" style={{ padding: 40 }} />
      ) : (
        <>
          <List
            dataSource={data.list}
            renderItem={(v) => {
              const isCurrent = currentVersionId === v.id;
              const status = (v.status as PanelVersionStatus) ?? 'draft';
              const badge = STATUS_BADGE[status];
              return (
                <List.Item style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <Tag color={badge.color}>{badge.text}</Tag>
                    {isCurrent && <Tag color="blue">★ 当前生效</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                    by user #{v.created_by} · {formatTime(v.created_at)}
                    {v.published_at && status === 'published' && (
                      <> · 发布于 {formatTime(v.published_at)}</>
                    )}
                    {v.published_at && status === 'archived' && (
                      <> · 曾发布于 {formatTime(v.published_at)}</>
                    )}
                  </div>
                  <Space size={4} wrap>
                    <Tooltip title="查看（只读预览）">
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => handleView(v)}
                      >
                        查看
                      </Button>
                    </Tooltip>
                    {status === 'draft' && canPublish && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<RocketOutlined />}
                        onClick={() => confirmPublish(v)}
                        loading={publishMutation.isPending && publishMutation.variables === v.id}
                      >
                        发布
                      </Button>
                    )}
                    {status === 'archived' && canPublish && (
                      <Button
                        size="small"
                        icon={<RollbackOutlined />}
                        onClick={() => confirmPublish(v)}
                        loading={publishMutation.isPending && publishMutation.variables === v.id}
                      >
                        回滚=发布
                      </Button>
                    )}
                    {status === 'draft' && canEdit && (
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openRename(v)}
                      >
                        改名
                      </Button>
                    )}
                    {status === 'draft' && canEdit && (
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => confirmDelete(v)}
                      >
                        删除
                      </Button>
                    )}
                  </Space>
                </List.Item>
              );
            }}
          />
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Pagination
              size="small"
              current={page}
              pageSize={pageSize}
              total={data.total}
              onChange={setPage}
              showSizeChanger={false}
            />
          </div>
        </>
      )}

      <Modal
        title="改版本名"
        open={renameOpen}
        onOk={handleRenameSubmit}
        onCancel={() => setRenameOpen(false)}
        confirmLoading={renameMutation.isPending}
        destroyOnClose
      >
        <Form form={renameForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="版本名"
            rules={[{ required: true, message: '请输入版本名' }, { max: 128 }]}
          >
            <Input placeholder="例：山区灯改造-v2" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 重新导出，避免 unused-import 警告（snapshot 仅用作 onView 类型注释参考）
export type { PanelSnapshot };
