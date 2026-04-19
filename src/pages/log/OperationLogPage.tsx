import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Select, Space, Pagination, Tag, Button, DatePicker } from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { logApi } from '@/api/log';
import { queryKeys } from '@/api/queryKeys';
import type { OperationLogItem } from '@/types/log';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const ACTION_OPTIONS = [
  { value: 'all', label: '全部操作' },
  { value: 'scene_switch', label: '场景切换' },
  { value: 'device_control', label: '设备控制' },
  { value: 'content_upload', label: '内容上传' },
  { value: 'content_distribute', label: '内容分发' },
  { value: 'show_publish', label: '演出发布' },
  { value: 'user_login', label: '用户登录' },
  { value: 'role_assign', label: '角色分配' },
  { value: 'permission_update', label: '权限更新' },
];

const ACTION_COLORS: Record<string, string> = {
  scene_switch: 'blue',
  device_control: 'cyan',
  content_upload: 'green',
  content_distribute: 'purple',
  show_publish: 'orange',
  user_login: 'default',
  role_assign: 'red',
  permission_update: 'magenta',
};

export default function OperationLogPage() {
  const { message } = useMessage();
  const [action, setAction] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const startDate = dateRange?.[0]?.format('YYYY-MM-DD');
  const endDate = dateRange?.[1]?.format('YYYY-MM-DD');

  const params = {
    page,
    page_size: pageSize,
    ...(action !== 'all' ? { action } : {}),
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.operationLogs(params as Record<string, unknown>),
    queryFn: () => logApi.getLogs(params),
    select: (res) => res.data.data,
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = {
        ...(action !== 'all' ? { action } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
      };
      const res = await logApi.exportCSV(exportParams);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `operation-logs-${dayjs().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const columns: TableColumnsType<OperationLogItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: '操作用户',
      dataIndex: 'user_name',
      width: 120,
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 120,
      render: (v: string) => {
        const label = ACTION_OPTIONS.find((o) => o.value === v)?.label || v;
        return <Tag color={ACTION_COLORS[v] || 'default'}>{label}</Tag>;
      },
    },
    {
      title: '描述',
      dataIndex: 'detail',
      ellipsis: true,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 140,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <PageHeader
        title="操作日志"
        description="查看系统操作记录"
        extra={
          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
          >
            导出 CSV
          </Button>
        }
      />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          value={action}
          onChange={(v) => { setAction(v); setPage(1); }}
          options={ACTION_OPTIONS}
        />
        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            setDateRange(dates as [Dayjs | null, Dayjs | null] | null);
            setPage(1);
          }}
        />
      </Space>

      <Table<OperationLogItem>
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
            onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          />
        </div>
      )}
    </div>
  );
}
