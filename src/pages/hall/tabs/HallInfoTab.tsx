import { useState } from 'react';
import { Card, Button, Modal, Form, DatePicker, InputNumber, Input } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import StatusTag from '@/components/common/StatusTag';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallDetail } from '@/api/gen/client';
import styles from './HallInfoTab.module.scss';

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
    mutationFn: (data: {
      service_start: string;
      service_end: string;
      grace_days: number;
      reason: string;
    }) =>
      hallApi.updateServicePeriod(
        hall.id,
        {
          service_start: data.service_start,
          service_end: data.service_end,
          grace_days: data.grace_days,
        },
        data.reason,
      ),
    onSuccess: () => {
      message.success('服务期更新成功');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hall.id) });
      setServiceModalOpen(false);
    },
    onError: (err: Error) => message.error(err.message || '服务期更新失败'),
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
        reason: values.reason,
      });
    });
  };

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
        styles={{ body: { padding: 4 } }}
      >
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>ID</div>
            <div className={`${styles.infoValue} ${styles.infoValueMono}`}>{hall.id}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>MDM 编号</div>
            <div className={`${styles.infoValue} ${styles.infoValueMono}`}>{hall.mdm_showroom_id}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>展厅名称</div>
            <div className={styles.infoValue}>{hall.name}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>服务状态</div>
            <div className={styles.infoValue}>
              <StatusTag status={hall.status === 'active' ? 'normal' : hall.status} />
            </div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>服务期</div>
            <div className={styles.infoValue}>
              {hall.service_period
                ? `${hall.service_period.service_start} ~ ${hall.service_period.service_end}（宽限 ${hall.service_period.grace_days} 天）`
                : '未设置'}
            </div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>展项数</div>
            <div className={styles.infoValue}>{hall.exhibit_count}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>设备数</div>
            <div className={styles.infoValue}>{hall.device_count}</div>
          </div>
          <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
            <div className={styles.infoLabel}>MQTT 配置</div>
            <div className={`${styles.infoValue} ${styles.infoValueMono}`}>
              {hall.mqtt_config
                ? <>
                    {hall.mqtt_config.broker_url}
                    <span className={styles.infoMqttSuffix}>({hall.mqtt_config.topic_prefix})</span>
                  </>
                : '未配置'}
            </div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>创建时间</div>
            <div className={styles.infoValue}>{dayjs(hall.created_at).format('YYYY-MM-DD HH:mm')}</div>
          </div>
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>更新时间</div>
            <div className={styles.infoValue}>{dayjs(hall.updated_at).format('YYYY-MM-DD HH:mm')}</div>
          </div>
        </div>
      </Card>

      <Modal
        title="管理服务期"
        open={serviceModalOpen}
        onOk={handleServiceSubmit}
        onCancel={() => setServiceModalOpen(false)}
        confirmLoading={updateServicePeriod.isPending}
      >
        <Form form={form} layout="vertical" className={styles.modalForm}>
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
          <Form.Item
            name="reason"
            label="操作原因"
            rules={[
              { required: true, message: '请填写操作原因（审计用）' },
              { min: 5, message: '操作原因至少 5 字' },
            ]}
            help="hall.update_service_period 是高风险操作，原因将记入审计日志（≥ 5 字）"
          >
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="例如：客户续约延长服务期至 2027-12-31" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
