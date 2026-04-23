import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Select, Space, Button, Modal, Form, Input, InputNumber,
  Pagination, Popconfirm,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { showApi } from '@/api/show';
import { hallApi } from '@/api/hall';
import { contentApi } from '@/api/content';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import { useHallStore } from '@/stores/hallStore';
import type { ShowListItem, ShowStatus } from '@/types/show';
import type { ExhibitListItem } from '@/types/hall';
import type { ContentListItem } from '@/types/content';

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
];

export default function ShowListPage() {
  const { message } = useMessage();
  const queryClient = useQueryClient();

  const selectedHallId = useHallStore((s) => s.selectedHallId);
  const canManage = useCan(
    'show.control',
    selectedHallId ? { type: 'hall', id: String(selectedHallId) } : undefined,
  );

  const [status, setStatus] = useState<ShowStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Exhibits for create modal
  const { data: exhibits } = useQuery({
    queryKey: queryKeys.exhibits(selectedHallId!),
    queryFn: () => hallApi.getExhibits(selectedHallId!),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });
  const exhibitOptions = (exhibits ?? []).map((e: ExhibitListItem) => ({
    value: e.id,
    label: e.name,
  }));

  // Video content for base video selector
  const { data: videoContents } = useQuery({
    queryKey: queryKeys.contents({ hall_id: selectedHallId!, page: 1, page_size: 200, status: 'ready' }),
    queryFn: () => contentApi.listContents({ hall_id: selectedHallId!, page: 1, page_size: 200, status: 'ready' as never }),
    select: (res) => (res.data.data?.list ?? []).filter((c: ContentListItem) => c.type === 'video'),
    enabled: !!selectedHallId,
  });
  const videoOptions = (videoContents ?? []).map((c: ContentListItem) => {
    const dur = c.duration > 0 ? ` (${Math.floor(c.duration / 60000)}:${String(Math.floor((c.duration % 60000) / 1000)).padStart(2, '0')})` : '';
    return { value: c.id, label: `${c.name}${dur}`, duration: c.duration };
  });

  // Shows query
  const params = {
    hall_id: selectedHallId!,
    page,
    page_size: pageSize,
    ...(status !== 'all' ? { status } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.shows(params as Record<string, unknown>),
    queryFn: () => showApi.getShows(params),
    select: (res) => res.data.data,
    enabled: !!selectedHallId,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof showApi.createShow>[0]) => showApi.createShow(body),
    onSuccess: () => {
      message.success('演出创建成功');
      queryClient.invalidateQueries({ queryKey: ['shows'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => showApi.deleteShow(id),
    onSuccess: () => {
      message.success('演出已删除');
      queryClient.invalidateQueries({ queryKey: ['shows'] });
    },
  });

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ duration_ms: 60000 });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      createMutation.mutate({
        hall_id: selectedHallId!,
        exhibit_id: values.exhibit_id,
        name: values.name,
        base_content_id: values.base_content_id || undefined,
        duration_ms: values.duration_ms,
      });
    });
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}分${sec > 0 ? sec + '秒' : ''}` : `${sec}秒`;
  };

  const columns: TableColumnsType<ShowListItem> = [
    { title: '编号', dataIndex: 'id', width: 70 },
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, record) => <Link to={`/shows/${record.id}`}>{name}</Link>,
    },
    { title: '主展项', dataIndex: 'exhibit_name', width: 140 },
    {
      title: '时长',
      dataIndex: 'duration_ms',
      width: 100,
      render: (ms: number) => formatDuration(ms),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 70,
      align: 'center',
      render: (v: number) => v > 0 ? `v${v}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => <StatusTag status={s} />,
    },
    {
      title: '轨道 / 动作',
      width: 100,
      align: 'center',
      render: (_: unknown, record) => `${record.track_count ?? 0} / ${record.action_count ?? 0}`,
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record) => (
        <Space size="small">
          <Link to={`/shows/${record.id}`}>详情</Link>
          <Link to={`/shows/${record.id}/timeline`}>编排</Link>
          {canManage && (
            <Popconfirm title="确认删除此演出？" onConfirm={() => deleteMutation.mutate(record.id)}>
              <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  };

  return (
    <div>
      <PageHeader
        title="演出管理"
        description="管理演出编排"
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!selectedHallId}>
              新建演出
            </Button>
          ) : undefined
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 140 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_OPTIONS}
          disabled={!selectedHallId}
        />
      </Space>

      {!selectedHallId ? (
        <div style={{ textAlign: 'center', color: 'var(--color-outline)', padding: 60 }}>
          请先在顶栏选择展厅查看演出列表
        </div>
      ) : (
        <>
          <Table<ShowListItem>
            columns={columns}
            dataSource={list}
            loading={isLoading}
            pagination={false}
            rowKey="id"
            size="middle"
          />
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                showTotal={(t) => `共 ${t} 条`}
                onChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Modal
        title="新建演出"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="演出名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} placeholder="例：开幕演出" />
          </Form.Item>
          <Form.Item name="exhibit_id" label="主展项" rules={[{ required: true, message: '请选择主展项' }]}>
            <Select options={exhibitOptions} placeholder="选择主展项" />
          </Form.Item>
          <Form.Item name="base_content_id" label="基准视频">
            <Select
              options={videoOptions}
              placeholder="选择基准视频（可选）"
              allowClear
              showSearch
              optionFilterProp="label"
              onChange={(val: number | undefined) => {
                if (val) {
                  const v = videoOptions.find((o) => o.value === val);
                  if (v?.duration) form.setFieldsValue({ duration_ms: v.duration });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="duration_ms" label="时长（毫秒）" rules={[{ required: true }]}>
            <InputNumber min={1000} step={1000} style={{ width: '100%' }} placeholder="60000" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
