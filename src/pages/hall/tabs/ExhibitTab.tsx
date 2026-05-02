import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, Popconfirm, Tooltip } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitListItem } from '@/api/gen/client';

interface ExhibitTabProps {
  hallId: number;
  canConfig: boolean;
  /** 顶栏选中的展项 → 在表格中高亮并滚动到该行 */
  highlightExhibitId?: number;
}

/* ─── DragHandle 单独一格的内容；整行可拖（DndContext 把整行包在 useSortable 里） ─── */
function DragHandle({ id, disabled }: { id: number; disabled: boolean }) {
  const { listeners, attributes, setActivatorNodeRef } = useSortable({ id });
  if (disabled) {
    return <HolderOutlined style={{ color: 'var(--color-outline-variant)', cursor: 'not-allowed' }} />;
  }
  return (
    <Tooltip title="按住拖动调整顺序" mouseEnterDelay={0.5}>
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        style={{ cursor: 'grab', display: 'inline-flex', padding: 4, color: 'var(--color-outline)' }}
        aria-label="拖动排序"
      >
        <HolderOutlined />
      </span>
    </Tooltip>
  );
}

/* ─── Sortable Row：把 antd Table 的 <tr> 包起来 ─── */
function SortableRow({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: string | number }) {
  const id = Number(props['data-row-key']);
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? {
          background: 'var(--color-primary-container, rgba(106,78,232,0.08))',
          zIndex: 1,
          position: 'relative',
        }
      : {}),
  };
  return (
    <tr ref={setNodeRef} {...props} style={style}>
      {children}
    </tr>
  );
}

export default function ExhibitTab({ hallId, canConfig, highlightExhibitId }: ExhibitTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const displayMode = Form.useWatch('display_mode', form);

  const { data: exhibits = [], isLoading } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
  });

  const sortedExhibits = [...exhibits].sort((a, b) => a.sort_order - b.sort_order);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof hallApi.createExhibit>[1]) =>
      hallApi.createExhibit(hallId, data),
    onSuccess: () => {
      message.success('展项创建成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (exhibitId: number) => hallApi.deleteExhibit(hallId, exhibitId),
    onSuccess: () => {
      message.success('展项已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (exhibitIds: number[]) => hallApi.reorderExhibits(hallId, exhibitIds),
    onMutate: async (newIds) => {
      // 乐观更新：先按目标顺序写本地缓存
      await queryClient.cancelQueries({ queryKey: queryKeys.exhibits(hallId) });
      const prev = queryClient.getQueryData(queryKeys.exhibits(hallId));
      queryClient.setQueryData(queryKeys.exhibits(hallId), (old: unknown) => {
        if (!old || typeof old !== 'object' || !('data' in old)) return old;
        const o = old as { data: { data: ExhibitListItem[] } };
        const map = new Map(o.data.data.map((e) => [e.id, e]));
        const reordered = newIds
          .map((id, idx) => {
            const e = map.get(id);
            return e ? { ...e, sort_order: (idx + 1) * 10 } : null;
          })
          .filter((e): e is ExhibitListItem => e !== null);
        return { ...o, data: { ...o.data, data: reordered } };
      });
      return { prev };
    },
    onError: (err, _newIds, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKeys.exhibits(hallId), context.prev);
      }
      message.error('排序保存失败：' + (err instanceof Error ? err.message : '未知错误'));
    },
    onSuccess: () => {
      message.success('排序已保存');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedExhibits.findIndex((e) => e.id === Number(active.id));
    const newIndex = sortedExhibits.findIndex((e) => e.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortedExhibits, oldIndex, newIndex);
    reorderMutation.mutate(next.map((e) => e.id));
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ display_mode: 'normal', sort_order: (exhibits.length + 1) * 10 });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      createMutation.mutate({
        name: values.name,
        description: values.description || '',
        sort_order: values.sort_order,
        display_mode: values.display_mode,
        ...(values.display_mode === 'simple_fusion' && values.projector_count
          ? {
              simple_fusion_config: {
                projector_count: values.projector_count,
                overlap_pixels: values.overlap_pixels || 0,
              },
            }
          : {}),
      });
    });
  };

  const columns: TableColumnsType<ExhibitListItem> = [
    ...(canConfig
      ? [
          {
            title: '',
            key: '_drag',
            width: 36,
            align: 'center' as const,
            render: (_: unknown, record: ExhibitListItem) => (
              <DragHandle id={record.id} disabled={reorderMutation.isPending} />
            ),
          },
        ]
      : []),
    {
      title: '#',
      key: '_idx',
      width: 48,
      align: 'center',
      render: (_: unknown, record: ExhibitListItem) => {
        const idx = sortedExhibits.findIndex((e) => e.id === record.id);
        return idx + 1;
      },
    },
    {
      title: '展项名称',
      dataIndex: 'name',
      render: (name: string, record: ExhibitListItem) => (
        <Link to={`/halls/${hallId}/exhibit-management/${record.id}`}>{name}</Link>
      ),
    },
    {
      title: '显示模式',
      dataIndex: 'display_mode',
      width: 110,
      render: (v: string) =>
        ({ normal: '普通', simple_fusion: '简易融合', touch_interactive: '触摸互动' }[v] ?? v),
    },
    { title: '设备数', dataIndex: 'device_count', width: 80, align: 'center' },
    { title: '数字内容', dataIndex: 'content_count', width: 90, align: 'center' },
    { title: '讲解词', dataIndex: 'script_count', width: 80, align: 'center' },
    {
      title: 'AI 形象',
      dataIndex: 'has_ai_avatar',
      width: 80,
      align: 'center',
      render: (v: boolean) => (v ? '有' : '-'),
    },
    ...(canConfig
      ? [
          {
            title: '操作',
            key: '_ops',
            width: 80,
            render: (_: unknown, record: ExhibitListItem) => (
              <Popconfirm
                title="确定删除此展项？"
                description="需要展项下无绑定的内容、设备和场景引用"
                onConfirm={() => deleteMutation.mutate(record.id)}
              >
                <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (!highlightExhibitId || isLoading) return;
    const row = cardRef.current?.querySelector<HTMLElement>(
      `tr[data-row-key="${highlightExhibitId}"]`,
    );
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightExhibitId, isLoading, exhibits]);

  return (
    <>
      <div ref={cardRef}>
        <Card
          title={`展项列表（${exhibits.length}）`}
          extra={
            canConfig ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建展项
              </Button>
            ) : undefined
          }
        >
          {canConfig ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedExhibits.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table<ExhibitListItem>
                  columns={columns}
                  dataSource={sortedExhibits}
                  loading={isLoading}
                  pagination={false}
                  rowKey="id"
                  size="middle"
                  rowClassName={(record) => (record.id === highlightExhibitId ? 'excs-row-highlight' : '')}
                  components={{ body: { row: SortableRow } }}
                />
              </SortableContext>
            </DndContext>
          ) : (
            <Table<ExhibitListItem>
              columns={columns}
              dataSource={sortedExhibits}
              loading={isLoading}
              pagination={false}
              rowKey="id"
              size="middle"
              rowClassName={(record) => (record.id === highlightExhibitId ? 'excs-row-highlight' : '')}
            />
          )}
        </Card>
      </div>

      {/* Create Modal（编辑能力已迁移到详情页就地编辑） */}
      <Modal
        title="新建展项"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="展项名称" rules={[{ required: true, message: '请输入展项名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="sort_order" label="排序号" rules={[{ required: true, message: '请输入排序号' }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="display_mode" label="显示模式" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'normal', label: '普通' },
                  { value: 'simple_fusion', label: '简易融合' },
                  { value: 'touch_interactive', label: '触摸互动' },
                ]}
              />
            </Form.Item>
          </Space>
          {displayMode === 'simple_fusion' && (
            <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
              <Form.Item name="projector_count" label="投影仪数量" rules={[{ required: true, message: '请输入投影仪数量' }]}>
                <InputNumber min={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="overlap_pixels" label="重叠像素">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Space>
          )}
        </Form>
      </Modal>
    </>
  );
}
