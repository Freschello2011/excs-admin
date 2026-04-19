import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, Popconfirm } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { ExhibitListItem, ExhibitScript } from '@/types/hall';

interface ExhibitTabProps {
  hallId: number;
  canConfig: boolean;
  /** 顶栏选中的展项 → 在表格中高亮并滚动到该行 */
  highlightExhibitId?: number;
}

export default function ExhibitTab({ hallId, canConfig, highlightExhibitId }: ExhibitTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExhibit, setEditingExhibit] = useState<ExhibitListItem | null>(null);
  const [form] = Form.useForm();
  const displayMode = Form.useWatch('display_mode', form);

  const [scriptsModalOpen, setScriptsModalOpen] = useState(false);
  const [scriptsExhibitId, setScriptsExhibitId] = useState<number | null>(null);
  const [scriptsExhibitName, setScriptsExhibitName] = useState('');
  const [scripts, setScripts] = useState<ExhibitScript[]>([]);

  const { data: exhibits = [], isLoading } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
  });

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof hallApi.updateExhibit>[2] }) =>
      hallApi.updateExhibit(hallId, id, data),
    onSuccess: () => {
      message.success('展项更新成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
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

  const scriptsMutation = useMutation({
    mutationFn: ({ exhibitId, data }: { exhibitId: number; data: ExhibitScript[] }) =>
      hallApi.updateExhibitScripts(hallId, exhibitId, data),
    onSuccess: () => {
      message.success('讲解词更新成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
      setScriptsModalOpen(false);
    },
  });

  // Sort mutation (update sort_order)
  const sortMutation = useMutation({
    mutationFn: ({ id, sort_order }: { id: number; sort_order: number }) =>
      hallApi.updateExhibit(hallId, id, { sort_order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibits(hallId) });
    },
  });

  const openCreate = () => {
    setEditingExhibit(null);
    form.resetFields();
    form.setFieldsValue({ display_mode: 'normal', sort_order: (exhibits.length + 1) * 10 });
    setModalOpen(true);
  };

  const openEdit = (record: ExhibitListItem) => {
    setEditingExhibit(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      sort_order: record.sort_order,
      display_mode: record.display_mode,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingExhibit(null);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      const data = {
        name: values.name,
        description: values.description || '',
        sort_order: values.sort_order,
        display_mode: values.display_mode,
        ...(values.display_mode === 'simple_fusion' && values.projector_count ? {
          simple_fusion_config: {
            projector_count: values.projector_count,
            overlap_pixels: values.overlap_pixels || 0,
          },
        } : {}),
      };

      if (editingExhibit) {
        updateMutation.mutate({ id: editingExhibit.id, data });
      } else {
        createMutation.mutate(data);
      }
    });
  };

  const openScripts = (record: ExhibitListItem) => {
    setScriptsExhibitId(record.id);
    setScriptsExhibitName(record.name);
    // Initialize with empty scripts if count is 0
    setScripts(
      record.script_count > 0
        ? Array.from({ length: record.script_count }, (_, i) => ({ content: '', sort_order: i + 1 }))
        : [{ content: '', sort_order: 1 }],
    );
    setScriptsModalOpen(true);
  };

  const handleScriptsSubmit = () => {
    if (scriptsExhibitId === null) return;
    const validScripts = scripts.filter((s) => s.content.trim());
    scriptsMutation.mutate({ exhibitId: scriptsExhibitId, data: validScripts });
  };

  const moveExhibit = (record: ExhibitListItem, direction: 'up' | 'down') => {
    const sorted = [...exhibits].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((e) => e.id === record.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const target = sorted[swapIdx];
    // Swap sort_order values
    sortMutation.mutate({ id: record.id, sort_order: target.sort_order });
    sortMutation.mutate({ id: target.id, sort_order: record.sort_order });
  };

  const columns: TableColumnsType<ExhibitListItem> = [
    { title: '排序', dataIndex: 'sort_order', width: 70, align: 'center' },
    {
      title: '展项名称',
      dataIndex: 'name',
      render: (name: string, record: ExhibitListItem) => (
        <Link to={`/halls/${hallId}/exhibit-management/${record.id}`}>{name}</Link>
      ),
    },
    { title: '显示模式', dataIndex: 'display_mode', width: 110, render: (v: string) => ({ normal: '普通', simple_fusion: '简易融合', touch_interactive: '触摸互动' }[v] ?? v) },
    { title: '设备数', dataIndex: 'device_count', width: 80, align: 'center' },
    { title: '内容数', dataIndex: 'content_count', width: 80, align: 'center' },
    { title: '讲解词', dataIndex: 'script_count', width: 80, align: 'center' },
    {
      title: 'AI 形象',
      dataIndex: 'has_ai_avatar',
      width: 80,
      align: 'center',
      render: (v: boolean) => v ? '有' : '-',
    },
    ...(canConfig ? [{
      title: '操作',
      width: 220,
      render: (_: unknown, record: ExhibitListItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => moveExhibit(record, 'up')} />
          <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => moveExhibit(record, 'down')} />
          <a onClick={() => openScripts(record)}>讲解词</a>
          <a onClick={() => openEdit(record)}>编辑</a>
          <Popconfirm
            title="确定删除此展项？"
            description="需要展项下无绑定的内容、设备和场景引用"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    }] : []),
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
          <Table<ExhibitListItem>
            columns={columns}
            dataSource={[...exhibits].sort((a, b) => a.sort_order - b.sort_order)}
            loading={isLoading}
            pagination={false}
            rowKey="id"
            size="middle"
            rowClassName={(record) => (record.id === highlightExhibitId ? 'excs-row-highlight' : '')}
          />
        </Card>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editingExhibit ? '编辑展项' : '新建展项'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
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

      {/* Scripts Modal */}
      <Modal
        title={`讲解词 - ${scriptsExhibitName}`}
        open={scriptsModalOpen}
        onOk={handleScriptsSubmit}
        onCancel={() => setScriptsModalOpen(false)}
        confirmLoading={scriptsMutation.isPending}
        width={640}
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          {scripts.map((script, idx) => (
            <div key={idx} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ minWidth: 28, lineHeight: '32px', color: 'var(--color-outline)' }}>
                  {idx + 1}.
                </span>
                <Input.TextArea
                  rows={3}
                  value={script.content}
                  onChange={(e) => {
                    const next = [...scripts];
                    next[idx] = { ...next[idx], content: e.target.value };
                    setScripts(next);
                  }}
                  placeholder="输入讲解内容..."
                />
                <Button
                  type="text"
                  danger
                  size="small"
                  onClick={() => setScripts(scripts.filter((_, i) => i !== idx))}
                  disabled={scripts.length <= 1}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="dashed"
            block
            onClick={() => setScripts([...scripts, { content: '', sort_order: scripts.length + 1 }])}
          >
            + 添加段落
          </Button>
        </div>
      </Modal>
    </>
  );
}
