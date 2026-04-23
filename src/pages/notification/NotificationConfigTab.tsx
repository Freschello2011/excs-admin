import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Table,
  Switch,
  Button,
  Tag,
  Space,
  Empty,
  AutoComplete,
} from 'antd';
import { useMessage } from '@/hooks/useMessage';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { notificationApi } from '@/api/notification';
import { userApi } from '@/api/user';
import { queryKeys } from '@/api/queryKeys';
import { useHallStore } from '@/stores/hallStore';
import type { NotificationConfigItem } from '@/types/notification';
import type { UserListItem } from '@/types/auth';

export default function NotificationConfigTab() {
  const { message } = useMessage();
  const queryClient = useQueryClient();
  const hallId = useHallStore((s) => s.selectedHallId);

  // Fetch notification configs for selected hall
  const { data: configs, isLoading } = useQuery({
    queryKey: queryKeys.notificationConfigs(hallId!),
    queryFn: () => notificationApi.getConfigs(hallId!),
    select: (res) => res.data.data,
    enabled: !!hallId,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      eventType,
      enabled,
      recipients,
    }: {
      eventType: string;
      enabled: boolean;
      recipients: string[];
    }) => notificationApi.updateConfig(hallId!, eventType, { enabled, recipients }),
    onSuccess: () => {
      message.success('配置已更新');
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationConfigs(hallId!) });
    },
  });

  const columns: TableColumnsType<NotificationConfigItem> = [
    {
      title: '事件类型',
      dataIndex: 'event_name',
      width: 180,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          loading={updateMutation.isPending}
          onChange={(checked) =>
            updateMutation.mutate({
              eventType: record.event_type,
              enabled: checked,
              recipients: record.recipients,
            })
          }
        />
      ),
    },
    {
      title: '通知人手机号',
      dataIndex: 'recipients',
      render: (recipients: string[], record) => (
        <RecipientEditor
          recipients={recipients}
          loading={updateMutation.isPending}
          onChange={(newRecipients) =>
            updateMutation.mutate({
              eventType: record.event_type,
              enabled: record.enabled,
              recipients: newRecipients,
            })
          }
        />
      ),
    },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="NAS 归档事件（nas_archived / nas_sync_failed / nas_agent_offline / nas_backlog_exceeded）是全局事件，接收人在「系统参数配置 → NAS 归档 → 告警接收人」配置，不在本页。"
        style={{ marginBottom: 16 }}
      />
      {!hallId ? (
        <Empty description="请先在顶栏选择展厅" />
      ) : (
        <Table<NotificationConfigItem>
          columns={columns}
          dataSource={configs ?? []}
          loading={isLoading}
          pagination={false}
          rowKey="event_type"
          size="middle"
        />
      )}
    </div>
  );
}

/** Inline editor for recipient phone numbers with SSO user auto-complete */
function RecipientEditor({
  recipients,
  loading,
  onChange,
}: {
  recipients: string[];
  loading: boolean;
  onChange: (recipients: string[]) => void;
}) {
  const { message } = useMessage();
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [searchResults, setSearchResults] = useState<UserListItem[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleAdd = (phone: string) => {
    const val = phone.trim();
    if (!val) return;
    if (val.includes('*')) {
      message.warning('手机号含脱敏字符，请手动输入完整手机号');
      return;
    }
    if (!/^1\d{10}$/.test(val)) {
      message.warning('请输入有效的 11 位手机号');
      return;
    }
    if (recipients.includes(val)) {
      message.warning('该号码已存在');
      return;
    }
    onChange([...recipients, val]);
    setNewPhone('');
    setSearchResults([]);
    setAdding(false);
  };

  const handleRemove = (phone: string) => {
    onChange(recipients.filter((r) => r !== phone));
  };

  const handleSearch = (value: string) => {
    setNewPhone(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim() || value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await userApi.getUsers({
          keyword: value.trim(),
          page: 1,
          page_size: 10,
        });
        setSearchResults(res.data.data?.list ?? []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  };

  const options = useMemo(() => {
    return searchResults
      .filter((u) => u.phone)
      .map((u) => ({
        value: u.phone,
        label: (
          <span>
            {u.phone}
            <span style={{ color: '#999', marginLeft: 8 }}>
              {u.name}
            </span>
          </span>
        ),
      }));
  }, [searchResults]);

  return (
    <div>
      <Space wrap size={[4, 4]}>
        {recipients.map((phone) => (
          <Tag
            key={phone}
            closable
            onClose={(e) => {
              e.preventDefault();
              handleRemove(phone);
            }}
          >
            {phone}
          </Tag>
        ))}
        {adding ? (
          <AutoComplete
            size="small"
            style={{ width: 200 }}
            placeholder="输入手机号搜索用户"
            value={newPhone}
            options={options}
            onSearch={handleSearch}
            onSelect={(val: string) => handleAdd(val)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPhone.trim()) {
                handleAdd(newPhone);
              }
            }}
            onBlur={() => {
              if (!newPhone.trim()) {
                setAdding(false);
                setSearchResults([]);
              }
            }}
            autoFocus
            disabled={loading}
          />
        ) : (
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setAdding(true)}
            disabled={loading}
          >
            添加
          </Button>
        )}
      </Space>
    </div>
  );
}
