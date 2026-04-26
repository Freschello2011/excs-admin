import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Form, Input, Select, DatePicker } from 'antd';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';

interface CreateHallModalProps {
  open: boolean;
  loading?: boolean;
  onOk: (values: {
    showroom_name: string;
    customer_id: number;
    contact_id?: number;
    address?: string;
    available_from?: string;
    available_to?: string;
    remark?: string;
  }) => void;
  onCancel: () => void;
}

export default function CreateHallModal({
  open, loading, onOk, onCancel,
}: CreateHallModalProps) {
  const [form] = Form.useForm();

  // Fetch MDM customers for dropdown
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: queryKeys.mdmCustomers(),
    queryFn: () => hallApi.getMdmCustomers(),
    select: (res) => res.data.data ?? [],
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      const data: Parameters<CreateHallModalProps['onOk']>[0] = {
        showroom_name: values.showroom_name,
        customer_id: values.customer_id,
        address: values.address || undefined,
        remark: values.remark || undefined,
      };
      if (values.available_range?.[0]) {
        data.available_from = values.available_range[0].format('YYYY-MM-DD');
      }
      if (values.available_range?.[1]) {
        data.available_to = values.available_range[1].format('YYYY-MM-DD');
      }
      onOk(data);
    });
  };

  return (
    <Modal
      title="新建展厅"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="showroom_name"
          label="展厅名称"
          rules={[{ required: true, message: '请输入展厅名称' }]}
        >
          <Input maxLength={200} placeholder="输入展厅名称" />
        </Form.Item>
        <Form.Item
          name="customer_id"
          label="所属客户"
          rules={[{ required: true, message: '请选择客户' }]}
        >
          <Select
            showSearch
            loading={customersLoading}
            placeholder="选择客户"
            optionFilterProp="label"
            options={customers.map((c) => ({
              value: c.id,
              label: c.customer_name,
            }))}
          />
        </Form.Item>
        <Form.Item name="address" label="地址">
          <Input maxLength={500} placeholder="展厅地址（可选）" />
        </Form.Item>
        <Form.Item name="available_range" label="可用日期范围">
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={500} placeholder="备注（可选）" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
