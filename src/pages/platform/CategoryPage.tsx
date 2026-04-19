import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, List, Tag, Empty, Typography, Alert } from 'antd';
import { AppstoreOutlined, BlockOutlined } from '@ant-design/icons';
import PageHeader from '@/components/common/PageHeader';
import { deviceCategoryApi } from '@/api/deviceCategory';
import { queryKeys } from '@/api/queryKeys';
import type { DeviceCategoryDTO, DeviceSubcategoryDTO } from '@/types/deviceCategory';

const { Text } = Typography;

/* ==================== 设备分类页面 ====================
 * 路由：/platform/device-categories
 * 简单两栏：左侧大类（7 个）、右侧小类（26 个）。
 * 只读视图（V1 不给增删，由 seed 维护）。
 */
export default function CategoryPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>();

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: queryKeys.deviceCategories,
    queryFn: () => deviceCategoryApi.list(),
    select: (res) => res.data.data,
  });

  const { data: allSubs = [], isLoading: loadingSubs } = useQuery({
    queryKey: queryKeys.deviceSubcategories(),
    queryFn: () => deviceCategoryApi.listSubcategories(),
    select: (res) => res.data.data,
  });

  /* 默认选中第一个大类（render 阶段派生，避免 setState in effect） */
  const activeCategoryId = selectedCategoryId ?? categories[0]?.id;

  const activeSubs = useMemo<DeviceSubcategoryDTO[]>(
    () => allSubs.filter((s) => s.category_id === activeCategoryId),
    [allSubs, activeCategoryId],
  );

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  return (
    <div>
      <PageHeader description="设备分类（大类 / 小类）只读视图。V1 由后端 seed 数据维护，UI 不提供增删改。" />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`共 ${categories.length} 个大类、${allSubs.length} 个小类`}
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左侧：大类 */}
        <Card
          size="small"
          title={<span><AppstoreOutlined /> 设备大类（{categories.length}）</span>}
          style={{ width: 300, flexShrink: 0 }}
          styles={{ body: { padding: 0 } }}
          loading={loadingCats}
        >
          <List
            dataSource={categories}
            locale={{ emptyText: <Empty description="暂无大类" /> }}
            renderItem={(item: DeviceCategoryDTO) => {
              const active = item.id === activeCategoryId;
              const subCount = allSubs.filter((s) => s.category_id === item.id).length;
              return (
                <List.Item
                  onClick={() => setSelectedCategoryId(item.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 16px',
                    background: active ? 'var(--ant-color-primary-bg)' : undefined,
                    borderLeft: active ? '3px solid var(--ant-color-primary)' : '3px solid transparent',
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text strong>{item.name}</Text>
                      <Tag>{subCount} 小类</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.code}</Text>
                  </div>
                </List.Item>
              );
            }}
          />
        </Card>

        {/* 右侧：小类 */}
        <Card
          size="small"
          style={{ flex: 1, minWidth: 0 }}
          title={
            <span>
              <BlockOutlined />{' '}
              {activeCategory ? `${activeCategory.name} — 小类` : '设备小类'}
              {activeSubs.length > 0 && <Tag style={{ marginLeft: 8 }}>{activeSubs.length}</Tag>}
            </span>
          }
          loading={loadingSubs}
        >
          {!activeCategory ? (
            <Empty description="请选择左侧大类" />
          ) : activeSubs.length === 0 ? (
            <Empty description="该大类下暂无小类" />
          ) : (
            <List
              dataSource={activeSubs}
              renderItem={(sub: DeviceSubcategoryDTO) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <Text strong>{sub.name}</Text>
                      <Tag>{sub.code}</Tag>
                    </div>
                    {sub.description && (
                      <Text type="secondary" style={{ fontSize: 12 }}>{sub.description}</Text>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
