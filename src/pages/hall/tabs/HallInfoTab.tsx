import { useState } from 'react';
import { Descriptions, Card, Button, Modal, Form, DatePicker, InputNumber } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallDetail } from '@/types/hall';

interface HallInfoTabProps {
  hall: HallDetail;
  isAdmin: boolean;
}

export default function HallInfoTab({ hall, isAdmin }: HallInfoTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [form] = Form.useForm();

  const updateServicePeriod = useMutation({
    mutationFn: (data: { service_start: string; service_end: string; grace_days: number }) =>
      hallApi.updateServicePeriod(hall.id, data),
    onSuccess: () => {
      message.success('服务期更新成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hall.id) });
      setServiceModalOpen(false);
    },
  });

  const openServiceModal = () => {
    form.setFieldsValue({
      range: hall.service_period
        ? [dayjs(hall.service_period.service_start), dayjs(hall.service_period.service_end)]
        : undefined,
      grace_days: hall.service_period?.grace_days ?? 0,
    });
    setServiceModalOpen(true);
  };

  const handleServiceSubmit = () => {
    form.validateFields().then((values) => {
      const [start, end] = values.range;
      updateServicePeriod.mutate({
        service_start: start.format('YYYY-MM-DD'),
        service_end: end.format('YYYY-MM-DD'),
        grace_days: values.grace_days,
      });
    });
  };

  const infoItems = [
    { key: 'id', label: 'ID', children: hall.id },
    { key: 'mdm_id', label: 'MDM 编号', children: hall.mdm_showroom_id },
    { key: 'name', label: '展厅名称', children: hall.name },
    { key: 'description', label: '描述', children: hall.description || '-', span: 2 },
    {
      key: 'status',
      label: '服务状态',
      children: <StatusTag status={hall.status === 'active' ? 'normal' : hall.status} />,
    },
    {
      key: 'service_period',
      label: '服务期',
      children: hall.service_period
        ? `${hall.service_period.service_start} ~ ${hall.service_period.service_end}（宽限 ${hall.service_period.grace_days} 天）`
        : '未设置',
    },
    { key: 'exhibit_count', label: '展项数', children: hall.exhibit_count },
    { key: 'device_count', label: '设备数', children: hall.device_count },
    {
      key: 'mqtt',
      label: 'MQTT 配置',
      children: hall.mqtt_config
        ? `${hall.mqtt_config.broker_url} (${hall.mqtt_config.topic_prefix})`
        : '未配置',
      span: 2,
    },
    { key: 'created_at', label: '创建时间', children: dayjs(hall.created_at).format('YYYY-MM-DD HH:mm') },
    { key: 'updated_at', label: '更新时间', children: dayjs(hall.updated_at).format('YYYY-MM-DD HH:mm') },
  ];

  return (
    <>
      <Card
        title="展厅信息"
        extra={
          isAdmin ? (
            <Button type="link" onClick={openServiceModal}>
              管理服务期
            </Button>
          ) : undefined
        }
      >
        <Descriptions bordered column={2} items={infoItems} />
      </Card>

      <Modal
        title="管理服务期"
        open={serviceModalOpen}
        onOk={handleServiceSubmit}
        onCancel={() => setServiceModalOpen(false)}
        confirmLoading={updateServicePeriod.isPending}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="range"
            label="服务期"
            rules={[{ required: true, message: '请选择服务期' }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="grace_days"
            label="宽限天数"
            rules={[{ required: true, message: '请输入宽限天数' }]}
          >
            <InputNumber min={0} max={30} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
