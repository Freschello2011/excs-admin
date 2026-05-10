/**
 * 展厅配置 Tab —— hall_master 选举 v2（hall.md §1.5）
 *
 * 把原 master + fallback 两个 Select 控件改造成「拖拽优先级列表」+ 自动回迁开关 +
 * 立即重选按钮，对接 PUT /halls/:id/master-priority + POST /halls/:id/elect-master。
 *
 * 候选项 = listExhibits 的结果。前端拖拽产出 priority 数组（顺序即优先级）；
 * 未列入数组的展项会按 sort_order 兜底（后端 `parsePriorityArray` + `addCandidate`
 * 一致语义），底部小字提示。
 *
 * 高风险（action=hall.switch_master, RequireReason=true）：保存 / 立即重选都走
 * `RiskyActionButton`，弹 Modal 强制 ≥ 5 字操作原因。reason 走 body（中文友好）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Form,
  Input,
  Switch,
  Space,
  Tag,
  Tooltip,
  Empty,
  Divider,
  Typography,
  Select,
  Button,
} from 'antd';
import {
  HolderOutlined,
  CloseOutlined,
  PlusOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { useMessage } from '@/hooks/useMessage';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import RiskyActionButton from '@/components/authz/RiskyActionButton';
import type {
  HallDetail,
  ExhibitListItem,
  MasterCandidateDTO,
} from '@/api/gen/client';
import styles from './HallConfigTab.module.scss';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const REASON_ENUM_ZH: Record<string, string> = {
  bootstrap: '服务启动',
  master_offline: '原主控离线',
  priority_promote: '优先级调整',
  manual_override: '管理员手动',
  no_candidate: '候补全离线',
};

interface HallConfigTabProps {
  hallId: number;
  hall: HallDetail;
  canConfig: boolean;
}

interface SortableExhibitRowProps {
  exhibitId: number;
  exhibitName: string;
  isCurrentMaster: boolean;
  isOnline?: boolean;
  onRemove: () => void;
  disabled: boolean;
}

function SortableExhibitRow({
  exhibitId,
  exhibitName,
  isCurrentMaster,
  isOnline,
  onRemove,
  disabled,
}: SortableExhibitRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `prio-${exhibitId}`,
    disabled,
  });
  // 仅保留 dnd-kit 必需的动态 transform/transition 在 inline；其他视觉走 SCSS。
  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`${styles.dragRow}${isDragging ? ` ${styles.dragging}` : ''}`}
    >
      <span
        {...(disabled ? {} : attributes)}
        {...(disabled ? {} : listeners)}
        className={`${styles.dragHandle}${disabled ? ` ${styles.disabled}` : ''}`}
      >
        <HolderOutlined />
      </span>
      <span className={styles.dragName}>{exhibitName}</span>
      {isCurrentMaster && <Tag color="blue">当前主控</Tag>}
      {isOnline === true && <Tag color="green">在线</Tag>}
      {isOnline === false && <Tag>离线</Tag>}
      {!disabled && (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onRemove}
          aria-label="移除"
        />
      )}
    </div>
  );
}

export default function HallConfigTab({ hallId, hall, canConfig }: HallConfigTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ ai_knowledge_text: string }>();
  const [wolForm] = Form.useForm<{ expected_subnets: string }>(); // ADR-0029

  // 本地维护的优先级数组（拖拽改的就是它，提交时整体提交）
  const [priority, setPriority] = useState<number[]>(() => hall.hall_master_priority ?? []);
  const [autoFailback, setAutoFailback] = useState<boolean>(hall.master_auto_failback ?? true);
  const [addPickerValue, setAddPickerValue] = useState<number | null>(null);

  // master-status 拉一次，给「当前主控 / 候补在线状态 / 上次切换」展示用
  const { data: masterStatus } = useQuery({
    queryKey: queryKeys.hallMasterStatus(hallId),
    queryFn: () => hallApi.getHallMasterStatus(hallId),
    select: (res) => res.data.data,
    refetchInterval: 30_000,
    enabled: canConfig,
  });

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
  });

  useEffect(() => {
    form.setFieldsValue({ ai_knowledge_text: hall.ai_knowledge_text || '' });
  }, [hall, form]);

  // ADR-0029：expected_subnets 同步
  useEffect(() => {
    wolForm.setFieldsValue({ expected_subnets: hall.expected_subnets || '' });
  }, [hall, wolForm]);

  // hall 字段变化时（通常是 invalidate 后重新取）同步本地 state
  useEffect(() => {
    setPriority(hall.hall_master_priority ?? []);
    setAutoFailback(hall.master_auto_failback ?? true);
  }, [hall.hall_master_priority, hall.master_auto_failback]);

  const exhibitMap = useMemo(() => {
    const m = new Map<number, ExhibitListItem>();
    exhibits.forEach((e) => m.set(e.id, e));
    return m;
  }, [exhibits]);

  const candidateMap = useMemo(() => {
    const m = new Map<number, MasterCandidateDTO>();
    masterStatus?.candidates?.forEach((c) => m.set(c.exhibit_id, c));
    return m;
  }, [masterStatus]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = priority.findIndex((id) => `prio-${id}` === active.id);
    const to = priority.findIndex((id) => `prio-${id}` === over.id);
    if (from < 0 || to < 0) return;
    setPriority((prev) => arrayMove(prev, from, to));
  };

  const handleRemove = (exhibitId: number) => {
    setPriority((prev) => prev.filter((id) => id !== exhibitId));
  };

  const handleAddExhibit = () => {
    if (!addPickerValue) return;
    if (priority.includes(addPickerValue)) {
      message.info('该展项已在优先级队列中');
      return;
    }
    setPriority((prev) => [...prev, addPickerValue]);
    setAddPickerValue(null);
  };

  const updateConfigMutation = useMutation({
    mutationFn: (data: { ai_knowledge_text: string }) => hallApi.updateHallConfig(hallId, data),
    onSuccess: () => {
      message.success('AI 知识文本已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
    },
  });

  // ADR-0029：保存 expected_subnets（CIDR 列表；空字符串清空 → server 退化弱判定）
  const updateWolSubnetsMutation = useMutation({
    mutationFn: (data: { expected_subnets: string }) =>
      hallApi.updateHallConfig(hallId, data),
    onSuccess: () => {
      message.success('展厅子网（WOL 兜底 LAN sanity）已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'CIDR 校验失败';
      message.error(msg);
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: ({
      data,
      reason,
    }: {
      data: { hall_master_priority: number[]; master_auto_failback: boolean };
      reason: string;
    }) => hallApi.updateHallMasterPriority(hallId, data, reason),
    onSuccess: () => {
      message.success('主控优先级已保存，选举已触发');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hallMasterStatus(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.appInstances(hallId) });
    },
  });

  const electMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => hallApi.electHallMaster(hallId, reason),
    onSuccess: () => {
      message.success('已触发重选');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hallMasterStatus(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.appInstances(hallId) });
    },
  });

  const handleSaveAi = () => {
    form.validateFields().then((values) => {
      updateConfigMutation.mutate({
        ai_knowledge_text: values.ai_knowledge_text || '',
      });
    });
  };

  // ADR-0029：保存 expected_subnets
  const handleSaveWolSubnets = () => {
    wolForm.validateFields().then((values) => {
      updateWolSubnetsMutation.mutate({
        expected_subnets: (values.expected_subnets || '').trim(),
      });
    });
  };

  const handleSavePriority = async (reason?: string) => {
    if (!reason) return;
    await updatePriorityMutation.mutateAsync({
      data: {
        hall_master_priority: priority,
        master_auto_failback: autoFailback,
      },
      reason,
    });
  };

  const handleElect = async (reason?: string) => {
    if (!reason) return;
    await electMutation.mutateAsync({ reason });
  };

  // priority 数组之外的展项（按 sort_order 升序展示，给"会按 sort_order 兜底"提示）
  const tailExhibits = useMemo(
    () =>
      exhibits
        .filter((e) => !priority.includes(e.id))
        .slice()
        .sort((a, b) =>
          a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.id - b.id,
        ),
    [exhibits, priority],
  );

  const addOptions = tailExhibits.map((e) => ({ value: e.id, label: e.name }));

  const currentMaster = masterStatus?.current_master_exhibit_id ?? null;
  const lastReasonZh = masterStatus?.last_election_reason
    ? REASON_ENUM_ZH[masterStatus.last_election_reason] ?? masterStatus.last_election_reason
    : '';
  const noCandidate = masterStatus?.last_election_reason === 'no_candidate';

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        title="AI 知识文本"
        extra={
          canConfig ? (
            <Button
              type="primary"
              loading={updateConfigMutation.isPending}
              onClick={handleSaveAi}
            >
              保存
            </Button>
          ) : undefined
        }
      >
        <Form form={form} layout="vertical" disabled={!canConfig} className={styles.aiForm}>
          <Form.Item name="ai_knowledge_text" label="AI 知识文本">
            <Input.TextArea
              rows={6}
              maxLength={10000}
              showCount
              placeholder="输入展厅知识文本，AI 互动时会作为上下文参考..."
            />
          </Form.Item>
        </Form>
      </Card>

      {/* ADR-0029 WOL 中控兜底 LAN sanity 配置 */}
      <Card
        title="WOL 中控兜底 — 展厅子网（ADR-0029）"
        extra={
          canConfig ? (
            <Button
              type="primary"
              loading={updateWolSubnetsMutation.isPending}
              onClick={handleSaveWolSubnets}
            >
              保存
            </Button>
          ) : undefined
        }
      >
        <Form form={wolForm} layout="vertical" disabled={!canConfig}>
          <Form.Item
            name="expected_subnets"
            label="展厅 LAN 网段（CIDR 列表，逗号分隔）"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                用于判定中控 App 是否处于展厅 LAN（决定能否担任 WOL 兜底 actor）。空值
                则退化为弱判定（看到展厅 mDNS 即放行）。例：
                <Typography.Text code>192.168.50.0/24,10.1.0.0/16</Typography.Text>
                。CIDR 必须是网段地址（如 192.168.50.0/24，不能是 192.168.50.255）。
              </Typography.Text>
            }
          >
            <Input
              placeholder="留空 = 退化弱判定（mDNS 看到展厅 App 即放行）"
              maxLength={255}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="主控展项优先级"
        extra={
          <Space>
            {canConfig && (
              <RiskyActionButton
                action="hall.switch_master"
                onConfirm={handleElect}
                confirmTitle="立即重选主控"
                confirmContent="跳过 stable_window，立即按当前优先级队列重新选举主控。请填写操作原因（≥ 5 字，审计用）。"
                loading={electMutation.isPending}
              >
                立即重选
              </RiskyActionButton>
            )}
            {canConfig && (
              <RiskyActionButton
                type="primary"
                action="hall.switch_master"
                onConfirm={handleSavePriority}
                confirmTitle="保存主控优先级"
                confirmContent="保存后会立即触发一次选举（按新顺序）。请填写操作原因（≥ 5 字，审计用）。"
                loading={updatePriorityMutation.isPending}
              >
                保存优先级
              </RiskyActionButton>
            )}
          </Space>
        }
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text type="secondary" className={styles.hint}>
            候补队列按拖拽顺序选举（第一个 online 实例即主控）；未列入的展项会按 sort_order
            兜底追加。
            {noCandidate && (
              <Tag color="error" className={styles.alertTagInline}>
                <ExclamationCircleFilled /> 当前无主控（候补全离线）
              </Tag>
            )}
          </Typography.Text>

          <Space size="middle" wrap>
            <Space>
              <span className={styles.inlineLabel}>当前主控：</span>
              {currentMaster ? (
                <Tag color="blue" icon={<CheckCircleFilled />}>
                  {exhibitMap.get(currentMaster)?.name ?? `#${currentMaster}`}
                </Tag>
              ) : (
                <Tag>无主控</Tag>
              )}
            </Space>
            {masterStatus?.last_election_at && (
              <Typography.Text type="secondary" className={styles.hint}>
                上次切换：{dayjs(masterStatus.last_election_at).fromNow()}
                {lastReasonZh ? ` · ${lastReasonZh}` : ''}
              </Typography.Text>
            )}
            <Space>
              <span className={styles.inlineLabel}>自动回迁：</span>
              <Tooltip title="开启时，原主控离线后选举器立即切到队列下一个；关闭时，需要手动重选才会切。">
                <Switch
                  checked={autoFailback}
                  disabled={!canConfig}
                  onChange={setAutoFailback}
                  checkedChildren="开"
                  unCheckedChildren="关"
                />
              </Tooltip>
            </Space>
          </Space>

          <Divider className={styles.dividerTight} />

          {priority.length === 0 ? (
            <Empty description="未配置优先级，将完全按展项 sort_order 兜底选举" />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={priority.map((id) => `prio-${id}`)}
                strategy={verticalListSortingStrategy}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {priority.map((id) => {
                    const ex = exhibitMap.get(id);
                    const cand = candidateMap.get(id);
                    return (
                      <SortableExhibitRow
                        key={id}
                        exhibitId={id}
                        exhibitName={ex?.name ?? `已删除展项 #${id}`}
                        isCurrentMaster={cand?.is_current_master ?? false}
                        isOnline={cand?.is_online}
                        onRemove={() => handleRemove(id)}
                        disabled={!canConfig}
                      />
                    );
                  })}
                </Space>
              </SortableContext>
            </DndContext>
          )}

          {canConfig && tailExhibits.length > 0 && (
            <Space className={styles.addRow}>
              <Select
                placeholder="选择要加入队列的展项"
                style={{ width: 240 }}
                value={addPickerValue ?? undefined}
                options={addOptions}
                onChange={(v) => setAddPickerValue(v)}
                allowClear
              />
              <Button icon={<PlusOutlined />} onClick={handleAddExhibit} disabled={!addPickerValue}>
                追加到队列
              </Button>
            </Space>
          )}

          {tailExhibits.length > 0 && (
            <Typography.Text type="secondary" className={`${styles.hint} ${styles.tailHint}`}>
              未列入的展项（按 sort_order 兜底选举）：
              {tailExhibits.map((e) => e.name).join('、')}
            </Typography.Text>
          )}
        </Space>
      </Card>
    </Space>
  );
}
