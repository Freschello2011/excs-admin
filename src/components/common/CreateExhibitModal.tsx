import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Space } from 'antd';

interface CreateExhibitModalProps {
  open: boolean;
  hallId: number;
  /** 现有展项数量，用于自动计算排序号 */
  existingCount: number;
  loading?: boolean;
  onOk: (values: {
    name: string;
    description: string;
    sort_order: number;
    display_mode: string;
    simple_fusion_config?: { projector_count: number; overlap_pixels: number };
  }) => void;
  onCancel: () => void;
}

export default function CreateExhibitModal({
  open, hallId: _hallId, existingCount, loading, onOk, onCancel,
}: CreateExhibitModalProps) {
  const [form] = Form.useForm();
  const displayMode = Form.useWatch('display_mode', form);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        display_mode: 'normal',
        sort_order: (existingCount + 1) * 10,
      });
    }
  }, [open, existingCount, form]);

  const handleOk = () => {
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
      onOk(data);
    });
  };

  return (
    <Modal
      title="新建展项"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
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
  );
}
