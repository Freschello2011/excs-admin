import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Space, Modal,
  Descriptions,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { aiApi } from '@/api/ai';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useHallStore } from '@/stores/hallStore';
import { useExhibitContextSync } from '@/hooks/useExhibitContextSync';
import type { ExhibitListItem } from '@/types/hall';
import AiAvatarConfigPanel from './AiAvatarConfigPanel';

export default function AiAvatarListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const storeExhibitId = useExhibitContextSync();

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedExhibitId, setSelectedExhibitId] = useState<number | null>(null);

  // Exhibits list
  const { data: exhibits, isLoading: exhibitsLoading } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  // Avatar detail for detail modal only (not triggered by edit modal)
  const { data: avatarDetail } = useQuery({
    queryKey: queryKeys.aiAvatarDetail(selectedExhibitId!),
    queryFn: () => aiApi.getAvatar(selectedExhibitId!, { skipErrorMessage: true }),
    select: (res) => res.data.data,
    enabled: !!selectedExhibitId && detailModalOpen,
  });

  const activateMutation = useMutation({
    mutationFn: (exhibitId: number) => aiApi.activateAvatar(exhibitId),
    onSuccess: () => {
      message.success('数字人已激活');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (exhibitId: number) => aiApi.deactivateAvatar(exhibitId),
    onSuccess: () => {
      message.success('数字人已停用');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });

  const openDetail = async (exhibitId: number) => {
    setSelectedExhibitId(exhibitId);
    setDetailModalOpen(true);
  };

  const canManage = selectedHallId
    ? isAdmin() || useAuthStore.getState().hasHallPermission(selectedHallId, 'system_config')
    : false;

  const canControl = selectedHallId
    ? isAdmin() || useAuthStore.getState().hasHallPermission(selectedHallId, 'device_control')
    : false;

  const columns: TableColumnsType<ExhibitListItem> = [
    { title: '编号', dataIndex: 'id', width: 70 },
    { title: '展项名称', dataIndex: 'name' },
    {
      title: '数字人',
      dataIndex: 'has_ai_avatar',
      width: 120,
      render: (v: boolean, record) => {
        if (record.display_mode === 'simple_fusion') {
          return <span style={{ color: 'var(--ant-color-text-quaternary)' }}>融合模式不支持</span>;
        }
        return v
          ? <StatusTag status="active" label="已配置" />
          : <span style={{ color: 'var(--ant-color-text-quaternary)' }}>未配置</span>;
      },
    },
    {
      title: '操作',
      width: 260,
      render: (_: unknown, record) => {
        const isFusion = record.display_mode === 'simple_fusion';
        return (
          <Space size="small">
            {record.has_ai_avatar && <a onClick={() => openDetail(record.id)}>查看</a>}
            {canManage && !isFusion && <a onClick={() => useHallStore.getState().setSelectedExhibit(record.id, record.name)}>配置</a>}
            {canManage && isFusion && (
              <span style={{ color: 'var(--ant-color-text-disabled)' }}>配置</span>
            )}
            {canControl && record.has_ai_avatar && !isFusion && (
              <>
                <a onClick={() => activateMutation.mutate(record.id)}>激活</a>
                <a style={{ color: 'var(--ant-color-error)' }} onClick={() => deactivateMutation.mutate(record.id)}>
                  停用
                </a>
              </>
            )}
          </Space>
        );
      },
    },
  ];

  // When an exhibit is selected via the top nav, show config panel directly
  if (storeExhibitId && selectedHallId) {
    return (
      <div>
        <PageHeader title="数字人" description="配置展项数字人" />
        <AiAvatarConfigPanel exhibitId={storeExhibitId} hallId={selectedHallId} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="数字人"
        description="管理展项数字人配置"
      />

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅
        </div>
      ) : (
        <Table<ExhibitListItem>
          columns={columns}
          dataSource={exhibits ?? []}
          loading={exhibitsLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      )}

      {/* Detail Modal */}
      <Modal
        title={`数字人详情 — ${avatarDetail?.exhibit_name ?? ''}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={560}
      >
        {avatarDetail ? (
          <Descriptions bordered size="small" column={2} style={{ marginTop: 16 }}>
            <Descriptions.Item label="展项">{avatarDetail.exhibit_name}</Descriptions.Item>
            <Descriptions.Item label="状态"><StatusTag status={avatarDetail.status} /></Descriptions.Item>
            <Descriptions.Item label="形象模板" span={2}>{avatarDetail.template_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="访客输入">{avatarDetail.visitor_input_enabled ? '允许' : '禁止'}</Descriptions.Item>
            <Descriptions.Item label="语音 ID">{avatarDetail.config?.voice_id ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="语速">{avatarDetail.config?.speech_rate ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{avatarDetail.updated_at}</Descriptions.Item>
            <Descriptions.Item label="开场白" span={2}>
              <div style={{ maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {avatarDetail.greeting_message || '（空）'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="知识文本" span={2}>
              <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {avatarDetail.knowledge_text || '（空）'}
              </div>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--ant-color-text-quaternary)', padding: 24 }}>加载中...</div>
        )}
      </Modal>
    </div>
  );
}
