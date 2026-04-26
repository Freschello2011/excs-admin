import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Result, Spin, Typography } from 'antd';
import { redirectToSSO } from '@/api/request';
import { vendorApi } from '@/api/vendor';
import type { InviteInfo } from '@/api/gen/client';

const { Paragraph, Text } = Typography;

/**
 * AcceptInvitePage —— 邀请接受页（公开路由 /invite/:token）。
 *
 * 流程：
 *   1. 按 token 拉取 InviteInfo（脱敏后的手机 / 邮箱 / 是否主账号）；
 *   2. 引导用户点击"前往 SSO 设置密码并登录"；
 *   3. 按钮点击后走 redirectToSSO({ prompt: 'login' })，SSO 登录页用邀请里的
 *      手机号作为 account 登录；首次登录后 must_change_pwd=true 会强制改密；
 *   4. 登录成功回到 /login/callback；若是 vendor 账号，LoginCallbackPage 会路由到 /vendor。
 *
 * 注：Phase 8 暂不实现 SSO 侧邀请链接直达设密页（需 SSO 自己出相应端点）；
 * 现版本走"手机号 + 初始密码"的通用登录流，初始密码由创建供应商的管理员
 * 从 SSO 管理后台的响应里拿到后线下发给主账号。
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['authz', 'invite', token],
    queryFn: () => vendorApi.getInvite(token as string),
    select: (res) => res.data.data as InviteInfo,
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    document.title = '邀请激活 · ExCS';
  }, []);

  if (!token) {
    return (
      <Card style={{ maxWidth: 520, margin: '80px auto' }}>
        <Result status="error" title="无效的邀请链接" />
      </Card>
    );
  }
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="加载邀请信息…" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card style={{ maxWidth: 520, margin: '80px auto' }}>
        <Result
          status="warning"
          title="邀请链接无效或已过期"
          subTitle="邀请链接仅在创建后 24 小时内有效。请联系邀请您的管理员重新生成。"
          extra={<Button onClick={() => navigate('/login/callback', { replace: true })}>返回登录页</Button>}
        />
      </Card>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 560, width: '100%' }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          欢迎加入 ExCS{data.is_primary ? '（主账号）' : '（子账号）'}
        </Typography.Title>
        <Paragraph type="secondary" style={{ textAlign: 'center' }}>
          您的账号已由管理员创建。请通过 SSO 完成首次登录。
        </Paragraph>
        <Card type="inner" title="账号信息" style={{ marginBottom: 16 }}>
          <Paragraph>
            <Text type="secondary">昵称：</Text>
            <Text>{data.nickname}</Text>
          </Paragraph>
          <Paragraph>
            <Text type="secondary">手机：</Text>
            <Text code>{data.phone || '-'}</Text>
          </Paragraph>
          {data.email && (
            <Paragraph>
              <Text type="secondary">邮箱：</Text>
              <Text code>{data.email}</Text>
            </Paragraph>
          )}
        </Card>

        {data.has_initial_password && (
          <Paragraph type="warning">
            您的账号已分配一次性初始密码——管理员应已通过邮件/即时通讯工具发给您。
            首次登录后系统会要求您立即修改密码。若未收到初始密码，请联系邀请您的管理员。
          </Paragraph>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Button
            type="primary"
            size="large"
            loading={submitting}
            onClick={() => {
              setSubmitting(true);
              // 引导到 SSO 登录（SSO 侧会把 prompt=login 理解为强制重新认证）。
              redirectToSSO({ prompt: 'login' });
            }}
          >
            前往 SSO 登录
          </Button>
        </div>
      </Card>
    </div>
  );
}
