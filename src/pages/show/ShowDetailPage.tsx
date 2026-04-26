import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Space, Form, Input, InputNumber, Select, Modal, Card,
  Collapse, Popconfirm, Descriptions, Tag, Empty,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import {
  PlusOutlined, DeleteOutlined, ArrowLeftOutlined,
  SendOutlined, PlusCircleOutlined, FieldTimeOutlined,
} from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import StatusTag from '@/components/common/StatusTag';
import { showApi } from '@/api/show';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import { useCan } from '@/lib/authz/can';
import type { ShowTrack, ShowAction, TrackType } from '@/api/gen/client';
import type { DeviceListItem } from '@/api/gen/client';

const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  video: '视频',
  light: '灯光',
  mechanical: '机械',
  audio: '音频',
  custom: '自定义',
};

const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  video: 'blue',
  light: 'gold',
  mechanical: 'purple',
  audio: 'green',
  custom: 'default',
};

const TRACK_TYPE_OPTIONS = Object.entries(TRACK_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export default function ShowDetailPage() {
  const { message } = useMessage();
  const { showId: showIdStr } = useParams<{ showId: string }>();
  const showId = Number(showIdStr);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [editingAction, setEditingAction] = useState<ShowAction | null>(null);
  const [trackForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Show detail
  const { data: show, isLoading } = useQuery({
    queryKey: queryKeys.showDetail(showId),
    queryFn: () => showApi.getShow(showId),
    select: (res) => res.data.data,
    enabled: showId > 0,
  });

  // Devices for action editing
  const { data: devices } = useQuery({
    queryKey: queryKeys.devices({ hall_id: show?.hall_id } as Record<string, unknown>),
    queryFn: () => hallApi.getDevices({ hall_id: show!.hall_id }),
    select: (res) => res.data.data,
    enabled: !!show?.hall_id,
  });
  const deviceOptions = (devices ?? []).map((d: DeviceListItem) => ({
    value: d.id,
    label: `${d.name}（${d.subcategory_name ?? d.model_name ?? ''}）`,
  }));

  const canManage = useCan(
    'show.control',
    show?.hall_id ? { type: 'hall', id: String(show.hall_id) } : undefined,
  );

  const invalidateShow = () => queryClient.invalidateQueries({ queryKey: queryKeys.showDetail(showId) });

  // Mutations
  const updateShowMutation = useMutation({
    mutationFn: (data: Parameters<typeof showApi.updateShow>[1]) => showApi.updateShow(showId, data),
    onSuccess: () => { message.success('演出信息已更新'); invalidateShow(); setEditModalOpen(false); },
  });

  const addTrackMutation = useMutation({
    mutationFn: (data: Parameters<typeof showApi.addTrack>[1]) => showApi.addTrack(showId, data),
    onSuccess: () => { message.success('轨道已添加'); invalidateShow(); setTrackModalOpen(false); trackForm.resetFields(); },
  });

  const deleteTrackMutation = useMutation({
    mutationFn: (trackId: number) => showApi.deleteTrack(showId, trackId),
    onSuccess: () => { message.success('轨道已删除'); invalidateShow(); },
  });

  const addActionMutation = useMutation({
    mutationFn: ({ trackId, data }: { trackId: number; data: Parameters<typeof showApi.addAction>[2] }) =>
      showApi.addAction(showId, trackId, data),
    onSuccess: () => { message.success('动作已添加'); invalidateShow(); setActionModalOpen(false); actionForm.resetFields(); },
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, data }: { actionId: number; data: Parameters<typeof showApi.updateAction>[2] }) =>
      showApi.updateAction(showId, actionId, data),
    onSuccess: () => { message.success('动作已更新'); invalidateShow(); setActionModalOpen(false); setEditingAction(null); actionForm.resetFields(); },
  });

  const deleteActionMutation = useMutation({
    mutationFn: (actionId: number) => showApi.deleteAction(showId, actionId),
    onSuccess: () => { message.success('动作已删除'); invalidateShow(); },
  });

  const publishMutation = useMutation({
    mutationFn: () => showApi.publishShow(showId),
    onSuccess: (res) => {
      message.success(`版本 v${res.data.data.version} 已发布`);
      invalidateShow();
      queryClient.invalidateQueries({ queryKey: ['shows'] });
    },
  });

  // Handlers
  const openAddTrack = () => {
    trackForm.resetFields();
    trackForm.setFieldsValue({ sort_order: (show?.tracks?.length ?? 0) + 1 });
    setTrackModalOpen(true);
  };

  const handleAddTrack = () => {
    trackForm.validateFields().then((values) => {
      addTrackMutation.mutate(values);
    });
  };

  const openAddAction = (trackId: number) => {
    setSelectedTrackId(trackId);
    setEditingAction(null);
    actionForm.resetFields();
    actionForm.setFieldsValue({ start_time_ms: 0, duration_ms: 1000 });
    setActionModalOpen(true);
  };

  const openEditAction = (trackId: number, action: ShowAction) => {
    setSelectedTrackId(trackId);
    setEditingAction(action);
    actionForm.setFieldsValue({
      device_id: action.device_id,
      start_time_ms: action.start_time_ms,
      duration_ms: action.duration_ms,
      command: action.command,
      params_json: action.params && Object.keys(action.params).length > 0 ? JSON.stringify(action.params) : '',
    });
    setActionModalOpen(true);
  };

  const handleActionSubmit = () => {
    actionForm.validateFields().then((values) => {
      let params: Record<string, unknown> = {};
      if (values.params_json) {
        try { params = JSON.parse(values.params_json); } catch { message.error('参数 JSON 格式错误'); return; }
      }
      const body = {
        device_id: values.device_id,
        start_time_ms: values.start_time_ms,
        duration_ms: values.duration_ms,
        command: values.command,
        params,
      };
      if (editingAction) {
        updateActionMutation.mutate({ actionId: editingAction.id, data: body });
      } else {
        addActionMutation.mutate({ trackId: selectedTrackId!, data: body });
      }
    });
  };

  const openEditShow = () => {
    editForm.setFieldsValue({ name: show?.name, duration_ms: show?.duration_ms });
    setEditModalOpen(true);
  };

  const handleEditShow = () => {
    editForm.validateFields().then((values) => {
      updateShowMutation.mutate(values);
    });
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const msRem = ms % 1000;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}.${String(msRem).padStart(3, '0')}` : `${sec}.${String(msRem).padStart(3, '0')}s`;
  };

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ant-color-text-quaternary)' }}>加载中...</div>;
  }

  if (!show) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--ant-color-text-quaternary)' }}>演出不存在</div>;
  }

  const tracks = show.tracks ?? [];

  const collapseItems = tracks.map((track: ShowTrack) => ({
    key: String(track.id),
    label: (
      <Space>
        <Tag color={TRACK_TYPE_COLORS[track.track_type as TrackType]}>{TRACK_TYPE_LABELS[track.track_type as TrackType]}</Tag>
        <span>{track.name}</span>
        <span style={{ color: 'var(--ant-color-text-quaternary)' }}>（{track.actions?.length ?? 0} 个动作）</span>
      </Space>
    ),
    extra: canManage ? (
      <Space onClick={(e) => e.stopPropagation()}>
        <Button size="small" icon={<PlusOutlined />} onClick={() => openAddAction(track.id)}>
          添加动作
        </Button>
        <Popconfirm title="删除轨道将同时删除所有动作，确认？" onConfirm={() => deleteTrackMutation.mutate(track.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ) : undefined,
    children: (
      <div>
        {(!track.actions || track.actions.length === 0) ? (
          <Empty description="暂无动作" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          track.actions
            .slice()
            .sort((a: ShowAction, b: ShowAction) => a.start_time_ms - b.start_time_ms)
            .map((action: ShowAction) => (
              <Card key={action.id} size="small" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space wrap>
                    <Tag>{formatMs(action.start_time_ms)}</Tag>
                    <span>时长 {formatMs(action.duration_ms)}</span>
                    <span><strong>{action.device_name || `设备#${action.device_id}`}</strong></span>
                    <Tag color="blue">{action.command}</Tag>
                    {action.params && Object.keys(action.params).length > 0 && (
                      <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                        {JSON.stringify(action.params)}
                      </span>
                    )}
                  </Space>
                  {canManage && (
                    <Space size="small">
                      <a onClick={() => openEditAction(track.id, action)}>编辑</a>
                      <Popconfirm title="确认删除此动作？" onConfirm={() => deleteActionMutation.mutate(action.id)}>
                        <a style={{ color: 'var(--ant-color-error)' }}>删除</a>
                      </Popconfirm>
                    </Space>
                  )}
                </div>
              </Card>
            ))
        )}
      </div>
    ),
  }));

  return (
    <div>
      <PageHeader
        title={show.name}
        description={`主展项：${show.exhibit_name ?? '-'}`}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/shows')}>返回列表</Button>
            <Button type="primary" icon={<FieldTimeOutlined />} onClick={() => navigate(`/shows/${showId}/timeline`)}>
              时间轴编排
            </Button>
            {canManage && <Button onClick={openEditShow}>编辑信息</Button>}
            {canManage && (
              <Popconfirm title="确认发布当前版本？发布后将生成不可变快照。" onConfirm={() => publishMutation.mutate()}>
                <Button type="primary" icon={<SendOutlined />} loading={publishMutation.isPending}>
                  发布版本
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      />

      <Descriptions bordered size="small" column={4} style={{ marginBottom: 24 }}>
        <Descriptions.Item label="状态"><StatusTag status={show.status} /></Descriptions.Item>
        <Descriptions.Item label="版本">{show.version > 0 ? `v${show.version}` : '未发布'}</Descriptions.Item>
        <Descriptions.Item label="时长">{formatMs(show.duration_ms)}</Descriptions.Item>
        <Descriptions.Item label="轨道数">{tracks.length}</Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>轨道列表</h3>
        {canManage && (
          <Button type="dashed" icon={<PlusCircleOutlined />} onClick={openAddTrack}>
            添加轨道
          </Button>
        )}
      </div>

      {tracks.length === 0 ? (
        <Empty description="暂无轨道，请添加轨道开始编排" />
      ) : (
        <Collapse items={collapseItems} defaultActiveKey={tracks.map((t: ShowTrack) => String(t.id))} />
      )}

      {/* Edit Show Info Modal */}
      <Modal
        title="编辑演出信息"
        open={editModalOpen}
        onOk={handleEditShow}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={updateShowMutation.isPending}
        width={400}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="演出名称" rules={[{ required: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="duration_ms" label="时长（毫秒）" rules={[{ required: true }]}>
            <InputNumber min={1000} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Track Modal */}
      <Modal
        title="添加轨道"
        open={trackModalOpen}
        onOk={handleAddTrack}
        onCancel={() => { setTrackModalOpen(false); trackForm.resetFields(); }}
        confirmLoading={addTrackMutation.isPending}
        width={400}
        destroyOnClose
      >
        <Form form={trackForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="轨道名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={50} placeholder="例：主灯光轨道" />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="track_type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
              <Select options={TRACK_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="sort_order" label="排序" rules={[{ required: true }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Add/Edit Action Modal */}
      <Modal
        title={editingAction ? '编辑动作' : '添加动作'}
        open={actionModalOpen}
        onOk={handleActionSubmit}
        onCancel={() => { setActionModalOpen(false); setEditingAction(null); actionForm.resetFields(); }}
        confirmLoading={addActionMutation.isPending || updateActionMutation.isPending}
        width={520}
        destroyOnClose
      >
        <Form form={actionForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="device_id" label="设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select options={deviceOptions} placeholder="选择设备" showSearch optionFilterProp="label" />
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="start_time_ms" label="开始时间（ms）" rules={[{ required: true }]}>
              <InputNumber min={0} step={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="duration_ms" label="持续时间（ms）" rules={[{ required: true }]}>
              <InputNumber min={0} step={100} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="command" label="指令" rules={[{ required: true, message: '请输入指令' }]}>
            <Input placeholder="例：open、set_brightness" />
          </Form.Item>
          <Form.Item name="params_json" label="参数（JSON）">
            <Input.TextArea rows={3} placeholder='例：{"brightness": 80, "color": "#FF0000"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
