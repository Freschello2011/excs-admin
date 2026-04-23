import { Result } from 'antd';
import PageHeader from '@/components/common/PageHeader';

export default function AuditLogPlaceholder() {
  return (
    <div>
      <PageHeader description="授权审计日志——查询谁在什么时间对谁授予 / 撤销 / 续期了权限。" />
      <Result
        status="info"
        title="审计日志 Phase 11 上线"
        subTitle="当前 Phase 6 仅挂占位，完整表格 / 筛选 / 导出将在 authz Phase 11 补齐。"
      />
    </div>
  );
}
