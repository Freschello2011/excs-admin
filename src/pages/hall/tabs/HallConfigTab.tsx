import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Form, Input, Select, Button, Space } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { hallApi } from '@/api/hall';
import { queryKeys } from '@/api/queryKeys';
import type { HallDetail, ExhibitListItem } from '@/types/hall';

interface HallConfigTabProps {
  hallId: number;
  hall: HallDetail;
  canConfig: boolean;
}

export default function HallConfigTab({ hallId, hall, canConfig }: HallConfigTabProps) {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const { data: exhibits = [] } = useQuery({
    queryKey: queryKeys.exhibits(hallId),
    queryFn: () => hallApi.getExhibits(hallId),
    select: (res) => res.data.data,
  });

  useEffect(() => {
    form.setFieldsValue({
      ai_knowledge_text: hall.ai_knowledge_text || '',
      hall_master_exhibit_id: hall.hall_master_exhibit_id,
      hall_master_fallback_id: hall.hall_master_fallback_id,
    });
  }, [hall, form]);

  const updateConfig = useMutation({
    mutationFn: (data: Parameters<typeof hallApi.updateHallConfig>[1]) =>
      hallApi.updateHallConfig(hallId, data),
    onSuccess: () => {
      message.success('配置已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.hallDetail(hallId) });
    },
  });

  const handleSave = () => {
    form.validateFields().then((values) => {
      updateConfig.mutate({
        ai_knowledge_text: values.ai_knowledge_text,
        hall_master_exhibit_id: values.hall_master_exhibit_id ?? null,
        hall_master_fallback_id: values.hall_master_fallback_id ?? null,
      });
    });
  };

  const exhibitOptions = exhibits.map((e: ExhibitListItem) => ({ value: e.id, label: e.name }));

  return (
    <Card
      title="展厅配置"
      extra={
        canConfig ? (
          <Button type="primary" loading={updateConfig.isPending} onClick={handleSave}>
            保存配置
          </Button>
        ) : undefined
      }
    >
      <Form form={form} layout="vertical" disabled={!canConfig} style={{ maxWidth: 640 }}>
        <Form.Item name="ai_knowledge_text" label="AI 知识文本">
          <Input.TextArea
            rows={8}
            maxLength={10000}
            showCount
            placeholder="输入展厅知识文本，AI 互动时会作为上下文参考..."
          />
        </Form.Item>

        <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
          <Form.Item name="hall_master_exhibit_id" label="展厅主控展项">
            <Select options={exhibitOptions} allowClear placeholder="选择主控展项" />
          </Form.Item>
          <Form.Item name="hall_master_fallback_id" label="备选主控展项">
            <Select options={exhibitOptions} allowClear placeholder="选择备选展项" />
          </Form.Item>
        </Space>
      </Form>
    </Card>
  );
}
