import { useState, type ReactNode } from 'react';
import { Tabs, Form, Input, Button, Card, Alert, Space, Spin } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { SaveOutlined, UndoOutlined, ClockCircleOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sysConfigApi } from '@/api/sysConfig';
import { queryKeys } from '@/api/queryKeys';
import PageHeader from '@/components/common/PageHeader';
import BrandingForm from './BrandingForm';
import NASConfigTab from './NASConfigTab';
import type { ConfigItem } from '@/types/sysConfig';

/** Tab 中文标签映射（有序） */
const GROUP_TABS: { key: string; label: string }[] = [
  { key: 'branding', label: '品牌信息' },
  { key: 'credentials', label: 'Key 配置' },
  { key: 'cache', label: '缓存配置' },
  { key: 'mqtt', label: 'MQTT 配置' },
  { key: 'cmd_ack', label: '指令 ACK' },
  { key: 'gateway', label: '网关超时' },
  { key: 'content', label: '内容处理' },
  { key: 'oss', label: 'OSS 存储' },
  { key: 'general', label: '通用配置' },
  { key: 'smarthome', label: '智能家居' },
  { key: 'sms', label: '短信服务' },
  { key: 'nas', label: 'NAS 归档' },
];

/** 分组配置表单 */
function GroupConfigForm({ group }: { group: string }) {
  const { message } = useMessage();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useQuery({
    queryKey: queryKeys.sysConfigGroup(group),
    queryFn: () => sysConfigApi.getGroupConfigs(group),
    select: (res) => res.data.data,
  });

  const updateMutation = useMutation({
    mutationFn: (items: { key: string; value: string }[]) =>
      sysConfigApi.updateGroupConfigs(group, items),
    onSuccess: () => {
      message.success('配置已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.sysConfigGroup(group) });
    },
    onError: () => {
      message.error('保存失败');
    },
  });

  const handleSave = () => {
    const values = form.getFieldsValue();
    const items = Object.entries(values).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
    updateMutation.mutate(items);
  };

  const handleReset = () => {
    if (configData?.items) {
      const values: Record<string, string> = {};
      configData.items.forEach((item: ConfigItem) => {
        values[item.key] = item.is_sensitive ? '' : item.value;
      });
      form.setFieldsValue(values);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin />
      </div>
    );
  }

  const items = configData?.items ?? [];
  const initialValues: Record<string, string> = {};
  items.forEach((item: ConfigItem) => {
    // 敏感字段初始为空（placeholder 显示脱敏值）
    initialValues[item.key] = item.is_sensitive ? '' : item.value;
  });

  const groupLabel = GROUP_TABS.find((t) => t.key === group)?.label || group;

  return (
    <Card
      style={{ marginTop: 16 }}
      styles={{ body: { paddingTop: 24 } }}
    >
      <div style={{ marginBottom: 20, fontWeight: 600, fontSize: 15 }}>
        <span style={{ display: 'inline-block', width: 3, height: 16, background: '#1677ff', borderRadius: 2, marginRight: 8, verticalAlign: 'text-bottom' }} />
        {groupLabel}
      </div>

      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 12 }}
        initialValues={initialValues}
      >
        {items.map((item: ConfigItem) => (
          <Form.Item
            key={item.key}
            name={item.key}
            label={item.description || item.key}
            help={
              item.is_sensitive
                ? <span style={{ color: '#999', fontSize: 12 }}>{item.key}（留空则不修改，输入新值则覆盖）</span>
                : <span style={{ color: '#999', fontSize: 12 }}>{item.key}</span>
            }
          >
            {item.is_sensitive ? (
              <Input.Password
                placeholder={item.value || '留空则不修改'}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
              />
            ) : (
              <Input
                placeholder="请输入值"
                type={item.value_type === 'int' ? 'number' : 'text'}
              />
            )}
          </Form.Item>
        ))}

        <Form.Item wrapperCol={{ offset: 6, span: 12 }}>
          <Space>
            <Button onClick={handleReset} icon={<UndoOutlined />}>
              重置表单
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              loading={updateMutation.isPending}
              icon={<SaveOutlined />}
            >
              保存配置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <Alert
          message="配置生效提示"
          description={
            group === 'credentials'
              ? '凭据修改保存后立即生效。涉及连接类凭据（EMQX 密码等）可能需要重启服务。'
              : '大部分基础配置在保存后立即生效。涉及连接参数的设置可能需要重启服务。'
          }
          type="info"
          showIcon
          style={{ flex: 1 }}
        />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 24px',
          background: '#fafafa',
          borderRadius: 8,
          minWidth: 120,
        }}>
          <ClockCircleOutlined style={{ fontSize: 24, color: '#999', marginBottom: 4 }} />
          <span style={{ fontSize: 13, color: '#666' }}>上次修改</span>
          <span style={{ fontSize: 12, color: '#999' }}>—</span>
        </div>
      </div>
    </Card>
  );
}

/** 系统参数配置页面 */
export default function SysConfigPage() {
  const [activeTab, setActiveTab] = useState('branding');

  const tabItems = GROUP_TABS.map(({ key, label }) => {
    let children: ReactNode;
    if (key === 'branding') children = <BrandingForm />;
    else if (key === 'nas') children = <NASConfigTab />;
    else children = <GroupConfigForm group={key} />;
    return { key, label, children };
  });

  return (
    <div>
      <PageHeader
        title="系统参数配置"
        description="管理凭据密钥、缓存、MQTT、网关超时、内容处理等系统级参数。修改后即时生效。"
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        centered
        style={{ marginTop: 16 }}
      />
    </div>
  );
}
