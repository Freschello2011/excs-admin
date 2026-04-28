import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Space, Modal,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { aiApi } from '@/api/ai';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import { useExhibitContextSync } from '@/hooks/useExhibitContextSync';
import type { ExhibitListItem, AiAvatarConfig } from '@/api/gen/client';
import AiAvatarConfigPanel from './AiAvatarConfigPanel';
import styles from './AiAvatarListPage.module.scss';

/** Hero 抽象对话气泡 icon —— 不臆造具体形象（per UI 对齐 mockup #2） */
function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 18 L12 38 Q12 42 16 42 L40 42 L48 50 L48 42 L52 42 Q56 42 56 38 L56 18 Q56 14 52 14 L16 14 Q12 14 12 18 Z" fill="rgba(255,255,255,0.10)" />
      <circle cx="22" cy="28" r="2" fill="white" stroke="none" />
      <circle cx="32" cy="28" r="2" fill="white" stroke="none" />
      <circle cx="42" cy="28" r="2" fill="white" stroke="none" />
    </svg>
  );
}

export default function AiAvatarListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const storeExhibitId = useExhibitContextSync();
  const hallResource = selectedHallId ? { type: 'hall', id: String(selectedHallId) } : undefined;
  const canManage = useCan('ai.configure', hallResource);
  const canControl = useCan('ai.control', hallResource);

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
    mutationFn: (exhibitId: number) => aiApi.activateAvatar(exhibitId, selectedHallId!),
    onSuccess: () => {
      message.success('数字人已激活');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (exhibitId: number) => aiApi.deactivateAvatar(exhibitId, selectedHallId!),
    onSuccess: () => {
      message.success('数字人已停用');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });

  const openDetail = async (exhibitId: number) => {
    setSelectedExhibitId(exhibitId);
    setDetailModalOpen(true);
  };

  const columns: TableColumnsType<ExhibitListItem> = [
    { title: '编号', dataIndex: 'id', width: 70 },
    { title: '展项名称', dataIndex: 'name' },
    {
      title: '数字人',
      dataIndex: 'has_ai_avatar',
      width: 120,
      render: (v: boolean, record) => {
        if (record.display_mode === 'simple_fusion') {
          return <span className={styles.tableCellMuted}>融合模式不支持</span>;
        }
        return v
          ? <StatusTag status="active" label="已配置" />
          : <span className={styles.tableCellMuted}>未配置</span>;
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
              <span className={styles.tableCellDisabled}>配置</span>
            )}
            {canControl && record.has_ai_avatar && !isFusion && (
              <>
                <a onClick={() => activateMutation.mutate(record.id)}>激活</a>
                <a className={styles.tableLinkDanger} onClick={() => deactivateMutation.mutate(record.id)}>
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
        <div className={styles.emptyHallHint}>
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

      {/* Detail Modal —— 紫色 Hero + 双列子卡（视觉对齐 ui-align mockup #2，字段集合不变） */}
      <Modal
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        title={null}
        closable={false}
        width={880}
        className={styles.detailModal}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        {avatarDetail ? (
          <div className={styles.modalRoot}>
            {/* Hero */}
            <div className={styles.hero}>
              <button
                type="button"
                className={styles.heroClose}
                aria-label="关闭"
                onClick={() => setDetailModalOpen(false)}
              >
                ×
              </button>
              <div className={styles.avatarThumb}><ChatBubbleIcon /></div>
              <div className={styles.heroMeta}>
                <div className={styles.heroEyebrow}>数字人详情</div>
                <h2 className={styles.heroTitle}>{avatarDetail.exhibit_name}</h2>
                <div className={styles.heroTags}>
                  <StatusTag status={avatarDetail.status} />
                </div>
              </div>
            </div>

            {/* Body —— 双列 */}
            <div className={styles.modalBody}>
              {/* 左列：基本信息 + 语音参数 */}
              <div className={styles.modalCol}>
                <section className={styles.subCard}>
                  <div className={styles.subHead}>
                    <div className={styles.subTitle}><span className={styles.subTitleIcon}>i</span>基本信息</div>
                  </div>
                  <div className={styles.subBody}>
                    <div className={styles.pairList}>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>展项</div>
                        <div className={styles.pairVal}>{avatarDetail.exhibit_name}</div>
                      </div>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>状态</div>
                        <div className={styles.pairVal}><StatusTag status={avatarDetail.status} /></div>
                      </div>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>形象模板</div>
                        <div className={styles.pairVal}>{avatarDetail.template_name ?? '-'}</div>
                      </div>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>访客输入</div>
                        <div className={styles.pairVal}>{avatarDetail.visitor_input_enabled ? '允许' : '禁止'}</div>
                      </div>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>更新时间</div>
                        <div className={styles.pairVal}>{avatarDetail.updated_at}</div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={styles.subCard}>
                  <div className={styles.subHead}>
                    <div className={styles.subTitle}><span className={styles.subTitleIcon}>♪</span>语音参数</div>
                  </div>
                  <div className={styles.subBody}>
                    <div className={styles.pairList}>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>语音 ID</div>
                        <div className={`${styles.pairVal} ${styles.pairValMono}`}>
                          {(avatarDetail.config as AiAvatarConfig | undefined)?.voice_id ?? '-'}
                        </div>
                      </div>
                      <div className={styles.pair}>
                        <div className={styles.pairKey}>语速</div>
                        <div className={styles.pairVal}>
                          {(avatarDetail.config as AiAvatarConfig | undefined)?.speech_rate ?? '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* 右列：开场白 + 知识文本 */}
              <div className={styles.modalCol}>
                <section className={styles.subCard}>
                  <div className={styles.subHead}>
                    <div className={styles.subTitle}><span className={styles.subTitleIcon}>“</span>开场白</div>
                  </div>
                  <div className={styles.subBody}>
                    <div className={styles.longtext}>
                      {avatarDetail.greeting_message || <span className={styles.longtextEmpty}>（空）</span>}
                    </div>
                  </div>
                </section>

                <section className={styles.subCard}>
                  <div className={styles.subHead}>
                    <div className={styles.subTitle}><span className={styles.subTitleIcon}>📚</span>知识文本</div>
                  </div>
                  <div className={styles.subBody}>
                    <div className={`${styles.longtext} ${styles.longtextTall}`}>
                      {avatarDetail.knowledge_text || <span className={styles.longtextEmpty}>（空）</span>}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.modalLoading}>加载中...</div>
        )}
      </Modal>
    </div>
  );
}
