import { useState } from 'react';
import { Card, Form, Input, Button, Space, Upload, Image } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import { SaveOutlined, UndoOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sysConfigApi } from '@/api/sysConfig';
import { useBrandingStore } from '@/stores/brandingStore';
import { queryKeys } from '@/api/queryKeys';
import type { ConfigItem } from '@/types/sysConfig';

export default function BrandingForm() {
  const { message } = useMessage();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const fetchBranding = useBrandingStore((s) => s.fetchBranding);

  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: configData, isLoading } = useQuery({
    queryKey: queryKeys.sysConfigGroup('branding'),
    queryFn: () => sysConfigApi.getGroupConfigs('branding'),
    select: (res) => res.data.data,
  });

  // Set form values when data loads
  const items = configData?.items ?? [];
  const getVal = (key: string) => items.find((i: ConfigItem) => i.key === key)?.value ?? '';

  // Initialize logo from config
  if (configData && !logoUrl && getVal('logo_url')) {
    setLogoUrl(getVal('logo_url'));
  }

  const updateMutation = useMutation({
    mutationFn: (updateItems: { key: string; value: string }[]) =>
      sysConfigApi.updateGroupConfigs('branding', updateItems),
    onSuccess: () => {
      message.success('品牌信息已保存');
      queryClient.invalidateQueries({ queryKey: queryKeys.sysConfigGroup('branding') });
      fetchBranding();
    },
    onError: () => {
      message.error('保存失败');
    },
  });

  const handleSave = () => {
    const values = form.getFieldsValue();
    const updateItems = [
      { key: 'company_name', value: values.company_name ?? '' },
      { key: 'system_name', value: values.system_name ?? '' },
      { key: 'logo_url', value: logoUrl },
    ];
    updateMutation.mutate(updateItems);
  };

  const handleReset = () => {
    form.setFieldsValue({
      company_name: getVal('company_name'),
      system_name: getVal('system_name'),
    });
    setLogoUrl(getVal('logo_url'));
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await sysConfigApi.uploadLogo(file);
      if (res.data?.code === 0) {
        setLogoUrl(res.data.data.logo_url);
        message.success('Logo 上传成功');
      }
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false; // prevent default upload
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
  };

  if (isLoading) {
    return <Card style={{ marginTop: 16 }}><div style={{ textAlign: 'center', padding: 60 }}>加载中...</div></Card>;
  }

  return (
    <Card style={{ marginTop: 16 }} styles={{ body: { paddingTop: 24 } }}>
      <div style={{ marginBottom: 20, fontWeight: 600, fontSize: 15 }}>
        <span style={{ display: 'inline-block', width: 3, height: 16, background: '#1677ff', borderRadius: 2, marginRight: 8, verticalAlign: 'text-bottom' }} />
        品牌信息
      </div>

      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 12 }}
        initialValues={{
          company_name: getVal('company_name'),
          system_name: getVal('system_name'),
        }}
      >
        <Form.Item
          name="company_name"
          label="公司名称"
          help={<span style={{ color: '#999', fontSize: 12 }}>显示在侧边栏和页脚的公司名称</span>}
        >
          <Input placeholder="请输入公司名称" />
        </Form.Item>

        <Form.Item
          name="system_name"
          label="系统名称"
          help={<span style={{ color: '#999', fontSize: 12 }}>显示在侧边栏和浏览器标签页标题中的系统名称</span>}
        >
          <Input placeholder="请输入系统名称" />
        </Form.Item>

        <Form.Item
          label="系统 Logo"
          help={<span style={{ color: '#999', fontSize: 12 }}>上传后将替换侧边栏的默认图标，建议使用正方形图片</span>}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {logoUrl ? (
              <div style={{
                width: 64,
                height: 64,
                border: '1px solid var(--ant-color-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: '#fafafa',
              }}>
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={56}
                  height={56}
                  style={{ objectFit: 'contain' }}
                  preview={false}
                />
              </div>
            ) : (
              <div style={{
                width: 64,
                height: 64,
                border: '1px dashed var(--ant-color-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 12,
              }}>
                无 Logo
              </div>
            )}
            <Space>
              <Upload
                accept=".png,.jpg,.jpeg,.svg,.webp"
                showUploadList={false}
                beforeUpload={(file) => handleUpload(file)}
              >
                <Button icon={<UploadOutlined />} loading={uploading}>
                  {logoUrl ? '更换' : '上传'}
                </Button>
              </Upload>
              {logoUrl && (
                <Button danger icon={<DeleteOutlined />} onClick={handleRemoveLogo}>
                  移除
                </Button>
              )}
            </Space>
          </div>
        </Form.Item>

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
    </Card>
  );
}
