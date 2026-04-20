import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space,
  Collapse, Popconfirm,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import StatusTag from '@/components/common/StatusTag';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import type { ContentTag, TagDimension, ExhibitContentItem } from '@/types/content';

interface Props {
  hallId: number;
  exhibitId: number;
  canManage: boolean;
}

const DIMENSION_LABELS: Record<TagDimension, string> = {
  visual_element: '视觉元素',
  scene: '场景',
  theme: '主题',
  mood: '氛围',
};

const ALL_DIMENSIONS: TagDimension[] = ['visual_element', 'scene', 'theme', 'mood'];

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${frac}`;
}

export default function ExhibitTagsTab({ exhibitId, canManage }: Props) {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const [dimensionFilter, setDimensionFilter] = useState<TagDimension | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'manual'>('all');
  const [contentFilter, setContentFilter] = useState<number | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ContentTag | null>(null);
  const [form] = Form.useForm();

  // Fetch exhibit content for file dropdown
  const { data: contentItems = [] } = useQuery({
    queryKey: queryKeys.exhibitContent(exhibitId),
    queryFn: () => contentApi.getExhibitContent(exhibitId),
    select: (res) => res.data.data,
  });

  // Fetch tags
  const { data: tags = [], isLoading } = useQuery({
    queryKey: queryKeys.exhibitTags(exhibitId, { dimension: dimensionFilter, source: sourceFilter, content_id: contentFilter, keyword }),
    queryFn: () => contentApi.searchTags({ exhibit_id: exhibitId, keyword }),
    select: (res) => res.data.data,
  });

  // Collect unique content_ids for retag
  const contentIds = useMemo(() => {
    const ids = new Set<number>();
    contentItems.forEach((c: ExhibitContentItem) => ids.add(c.content_id));
    return Array.from(ids);
  }, [contentItems]);

  // Client-side filtering
  const filteredTags = useMemo(() => {
    let result = tags;
    if (dimensionFilter !== 'all') {
      result = result.filter((t) => t.dimension === dimensionFilter);
    }
    if (sourceFilter !== 'all') {
      result = result.filter((t) => t.source === sourceFilter);
    }
    if (contentFilter !== 'all') {
      result = result.filter((t) => t.content_id === contentFilter);
    }
    return result;
  }, [tags, dimensionFilter, sourceFilter, contentFilter]);

  // Group by dimension
  const tagsByDimension = useMemo(() => {
    const map = new Map<TagDimension, ContentTag[]>();
    for (const dim of ALL_DIMENSIONS) {
      map.set(dim, []);
    }
    for (const tag of filteredTags) {
      const dim = tag.dimension as TagDimension;
      const list = map.get(dim);
      if (list) list.push(tag);
    }
    return map;
  }, [filteredTags]);

  const createMutation = useMutation({
    mutationFn: (data: { content_id: number; tag: string; start_ms: number; end_ms: number }) => {
      return contentApi.createTag(data.content_id, data);
    },
    onSuccess: () => {
      message.success('标签创建成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitTags(exhibitId) });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ tagId, data }: { tagId: number; data: { tag?: string; start_ms?: number; end_ms?: number } }) =>
      contentApi.updateTag(tagId, data),
    onSuccess: () => {
      message.success('标签更新成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitTags(exhibitId) });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: number) => contentApi.deleteTag(tagId),
    onSuccess: () => {
      message.success('标签已删除');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitTags(exhibitId) });
    },
  });

  const retagMutation = useMutation({
    mutationFn: async () => {
      for (const contentId of contentIds) {
        await contentApi.retag(contentId);
      }
    },
    onSuccess: () => {
      message.success('AI 标签任务已触发');
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitTags(exhibitId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.exhibitContent(exhibitId) });
    },
  });

  const openCreate = () => {
    setEditingTag(null);
    form.resetFields();
    if (contentItems.length > 0) {
      form.setFieldsValue({ content_id: contentItems[0].content_id });
    }
    setModalOpen(true);
  };

  const openEdit = (tag: ContentTag) => {
    setEditingTag(tag);
    form.setFieldsValue({
      content_id: tag.content_id,
      dimension: tag.dimension,
      tag: tag.tag,
      start_ms: tag.start_ms,
      end_ms: tag.end_ms,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTag(null);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editingTag) {
        updateMutation.mutate({
          tagId: editingTag.id,
          data: { tag: values.tag, start_ms: values.start_ms, end_ms: values.end_ms },
        });
      } else {
        createMutation.mutate({
          content_id: values.content_id,
          tag: values.tag,
          start_ms: values.start_ms,
          end_ms: values.end_ms,
        });
      }
    });
  };

  const contentOptions = contentItems.map((c: ExhibitContentItem) => ({
    value: c.content_id,
    label: c.filename,
  }));

  const columns: TableColumnsType<ContentTag> = [
    { title: '标签', dataIndex: 'tag', width: 280, ellipsis: true },
    {
      title: '时间段',
      width: 200,
      render: (_: unknown, record) => (
        <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
          {formatMs(record.start_ms)} ~ {formatMs(record.end_ms)}
        </span>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 90,
      align: 'center',
      render: (v: string) => (
        <StatusTag
          status={v === 'ai' ? 'processing' : 'pending'}
          label={v === 'ai' ? 'AI' : '手动'}
        />
      ),
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      width: 90,
      align: 'center',
      render: (v: number | undefined) => (
        v !== undefined ? (
          <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{(v * 100).toFixed(0)}%</span>
        ) : <span style={{ color: 'var(--color-outline)' }}>—</span>
      ),
    },
    ...(canManage ? [{
      title: '操作',
      width: 120,
      render: (_: unknown, record: ContentTag) => (
        <Space size="small">
          <a onClick={() => openEdit(record)}>编辑</a>
          <Popconfirm title="确定删除此标签？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 130 }}
          value={dimensionFilter}
          onChange={setDimensionFilter}
          options={[
            { value: 'all', label: '全部维度' },
            ...ALL_DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABELS[d] })),
          ]}
        />
        <Select
          style={{ width: 110 }}
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: 'all', label: '全部来源' },
            { value: 'ai', label: 'AI' },
            { value: 'manual', label: '手动' },
          ]}
        />
        <Select
          style={{ width: 180 }}
          value={contentFilter}
          onChange={setContentFilter}
          options={[
            { value: 'all', label: '全部文件' },
            ...contentOptions,
          ]}
        />
        <Input.Search
          placeholder="搜索标签..."
          allowClear
          style={{ width: 200 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        {canManage && (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={contentItems.length === 0}>
              新建标签
            </Button>
            <Popconfirm
              title="确定重新触发 AI 标签？"
              description="将对该展项下所有内容重新分析。"
              onConfirm={() => retagMutation.mutate()}
            >
              <Button icon={<ReloadOutlined />} loading={retagMutation.isPending} disabled={contentIds.length === 0}>
                AI 重新打标
              </Button>
            </Popconfirm>
          </>
        )}
      </Space>

      {/* Tags grouped by dimension */}
      <Collapse
        defaultActiveKey={ALL_DIMENSIONS}
        items={ALL_DIMENSIONS.map((dim) => {
          const dimTags = tagsByDimension.get(dim) || [];
          return {
            key: dim,
            label: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                {DIMENSION_LABELS[dim]}
                <span
                  style={{
                    background: 'rgba(var(--color-primary-rgb), 0.12)',
                    color: 'var(--color-primary)',
                    padding: '1px 8px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    minWidth: 22,
                    textAlign: 'center',
                  }}
                >
                  {dimTags.length}
                </span>
              </span>
            ),
            children: (
              <Table<ContentTag>
                columns={columns}
                dataSource={dimTags}
                loading={isLoading}
                pagination={false}
                rowKey="id"
                size="small"
                locale={{ emptyText: '暂无标签' }}
              />
            ),
          };
        })}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingTag ? '编辑标签' : '新建标签'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editingTag && (
            <Form.Item name="content_id" label="所属内容文件" rules={[{ required: true, message: '请选择内容文件' }]}>
              <Select options={contentOptions} />
            </Form.Item>
          )}
          {!editingTag && (
            <Form.Item name="dimension" label="维度" rules={[{ required: true, message: '请选择维度' }]}>
              <Select options={ALL_DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))} />
            </Form.Item>
          )}
          <Form.Item name="tag" label="标签描述" rules={[{ required: true, message: '请输入标签描述' }]}>
            <Input maxLength={200} placeholder="例：企业外景航拍" />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="start_ms" label="开始时间 (ms)" rules={[{ required: true, message: '请输入' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="毫秒" />
            </Form.Item>
            <Form.Item name="end_ms" label="结束时间 (ms)" rules={[{ required: true, message: '请输入' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="毫秒" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
