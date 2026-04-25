import { useMemo } from 'react';
import { Card, Form, Button, Space, Spin, Empty, Typography, Tag } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { sysConfigApi } from '@/api/sysConfig';
import { queryKeys } from '@/api/queryKeys';
import { useMessage } from '@/hooks/useMessage';
import type { ConfigItem, ConfigGroupData } from '@/types/sysConfig';
import type { Section } from './ia';
import { sectionGroups } from './ia';
import FieldRow, { toFormInitialValue, fromFormValue } from './FieldRow';

const { Title, Text } = Typography;

/** Form 字段名编码：`${group}__${key}` —— 解决跨 group 同名字段冲突 */
const FIELD_SEP = '__';
const encodeName = (group: string, key: string) => `${group}${FIELD_SEP}${key}`;
const decodeName = (name: string): [string, string] => {
  const idx = name.indexOf(FIELD_SEP);
  return [name.slice(0, idx), name.slice(idx + FIELD_SEP.length)];
};

interface IntegrationCardProps {
  section: Section;
  /** 用于搜索高亮 */
  highlight?: boolean;
}

export default function IntegrationCard({ section, highlight }: IntegrationCardProps) {
  const { message } = useMessage();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const groups = useMemo(() => sectionGroups(section), [section]);

  // 并行加载所有相关物理 group
  const queries = useQueries({
    queries: groups.map((g) => ({
      queryKey: queryKeys.sysConfigGroup(g),
      queryFn: () => sysConfigApi.getGroupConfigs(g),
      select: (res: { data: { data: ConfigGroupData } }) => res.data.data,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  /** group → key → ConfigItem */
  const groupItemMap = useMemo(() => {
    const map: Record<string, Record<string, ConfigItem>> = {};
    queries.forEach((q, idx) => {
      const g = groups[idx];
      const items = (q.data as ConfigGroupData | undefined)?.items ?? [];
      map[g] = {};
      items.forEach((item) => {
        map[g][item.key] = item;
      });
    });
    return map;
  }, [queries, groups]);

  /** 表单初始值 */
  const initialValues = useMemo(() => {
    if (section.kind !== 'fields' || !section.fields) return {};
    const init: Record<string, unknown> = {};
    section.fields.forEach((ref) => {
      const item = groupItemMap[ref.group]?.[ref.key];
      if (item) {
        init[encodeName(ref.group, ref.key)] = toFormInitialValue(item);
      }
    });
    return init;
  }, [section, groupItemMap]);

  // 多 group 保存：按 group 分桶并行 PUT
  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, { key: string; value: string }[]>) => {
      const tasks = Object.entries(payload).map(([group, items]) =>
        sysConfigApi.updateGroupConfigs(group, items),
      );
      return Promise.all(tasks);
    },
    onSuccess: () => {
      message.success(`「${section.title}」已保存`);
      groups.forEach((g) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.sysConfigGroup(g) });
      });
    },
    onError: () => {
      message.error('保存失败，请重试');
    },
  });

  const handleSave = async () => {
    if (section.kind !== 'fields' || !section.fields) return;
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue();

    // 按物理 group 分桶
    const buckets: Record<string, { key: string; value: string }[]> = {};
    Object.entries(values).forEach(([fieldName, val]) => {
      const [group, key] = decodeName(fieldName);
      const item = groupItemMap[group]?.[key];
      if (!item) return;
      // 敏感字段：空值表示"不修改"，跳过
      if (item.is_sensitive && (val === '' || val === undefined || val === null)) return;
      if (!buckets[group]) buckets[group] = [];
      buckets[group].push({ key, value: fromFormValue(val, item) });
    });

    if (Object.keys(buckets).length === 0) {
      message.info('没有可保存的改动');
      return;
    }
    saveMutation.mutate(buckets);
  };

  const handleReset = () => {
    form.resetFields();
    form.setFieldsValue(initialValues);
  };

  // 卡片标题
  const titleNode = (
    <Space size={10} align="center">
      <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--ant-color-primary)' }}>
        {section.icon}
      </span>
      <Title level={5} style={{ margin: 0 }}>{section.title}</Title>
      {highlight && <Tag color="gold">命中搜索</Tag>}
    </Space>
  );

  return (
    <Card
      id={`section-${section.key}`}
      style={{ marginBottom: 16, scrollMarginTop: 16, ...(highlight ? { boxShadow: '0 0 0 2px var(--ant-color-warning)' } : null) }}
      title={titleNode}
      extra={null}
    >
      {section.description && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{section.description}</Text>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : isError ? (
        <Empty description="加载失败" />
      ) : section.kind === 'fields' && section.fields ? (
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ flex: '170px' }}
          wrapperCol={{ flex: '1 1 auto' }}
          labelAlign="right"
          labelWrap
          initialValues={initialValues}
        >
          {section.fields.map((ref) => {
            const item = groupItemMap[ref.group]?.[ref.key];
            if (!item) {
              return (
                <Form.Item key={`${ref.group}.${ref.key}`} label={ref.label || ref.key}>
                  <Text type="secondary">字段 {ref.group}.{ref.key} 未在后端注册</Text>
                </Form.Item>
              );
            }
            return (
              <FieldRow
                key={`${ref.group}.${ref.key}`}
                ref={ref}
                item={item}
                fieldName={encodeName(ref.group, ref.key)}
              />
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--ant-color-border-secondary, rgba(255,255,255,0.08))', textAlign: 'right' }}>
            <Space>
              <Button onClick={handleReset} icon={<UndoOutlined />}>重置</Button>
              <Button
                type="primary"
                onClick={handleSave}
                loading={saveMutation.isPending}
                icon={<SaveOutlined />}
              >
                保存
              </Button>
            </Space>
          </div>
        </Form>
      ) : null}
    </Card>
  );
}
