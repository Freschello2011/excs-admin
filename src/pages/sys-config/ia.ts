/**
 * 系统参数配置「虚拟分组 → 物理分组」映射
 *
 * 后端 sys_configs 表按 (config_group, config_key) 物理存储；
 * 前端按"运维语义"重组为分类 / 集成卡片，让管理员能凭直觉找到字段。
 *
 * 一个 Section 可能跨多个物理 group——保存时按 group 分桶 PUT。
 */

export interface FieldRef {
  /** 物理 group（后端 sys_configs.config_group） */
  group: string;
  /** 物理 key（后端 sys_configs.config_key） */
  key: string;
  /** 前端短标题（双行 label 的主标题）；缺省回退到后端 description */
  label?: string;
  /** 输入框尾部单位（"元" / "秒" / "GB" 等） */
  suffix?: string;
  /** 数值范围 */
  min?: number;
  max?: number;
}

export type SectionKind = 'fields' | 'branding' | 'nas';

export interface Section {
  key: string;
  title: string;
  icon: string;
  /** 一句话简介，显示在卡片标题下方 */
  description?: string;
  /** 通用字段列表 / branding / nas 三种渲染分支 */
  kind: SectionKind;
  /** 当 kind === 'fields' 时填 */
  fields?: FieldRef[];
}

export interface Category {
  key: string;
  title: string;
  /** 分类副标题，显示在分类标题下方小字 */
  hint?: string;
  sections: Section[];
}

export const IA: Category[] = [
  {
    key: 'brand',
    title: '品牌与外观',
    hint: '任意管理员可改；影响登录页与侧边栏外观',
    sections: [
      {
        key: 'branding',
        title: '品牌信息',
        icon: 'palette',
        description: '公司名称、系统名称、Logo',
        kind: 'branding',
      },
      {
        key: 'dashboard-prefs',
        title: '仪表盘偏好',
        icon: 'space_dashboard',
        description: '本月费用预算与最近记录条数',
        kind: 'fields',
        fields: [
          { group: 'dashboard', key: 'monthly_budget_cny', label: '本月费用预算', suffix: '元', min: 0 },
          { group: 'general', key: 'dashboard_recent_limit', label: '最近记录条数', suffix: '条', min: 1, max: 50 },
        ],
      },
    ],
  },
  {
    key: 'aliyun',
    title: '集成 · 阿里云',
    hint: '不同服务使用不同 RAM 子账号，最小权限隔离',
    sections: [
      {
        key: 'oss',
        title: 'OSS 对象存储',
        icon: 'cloud',
        description: '内容上传 / 下载凭据 + STS 角色 + 上传上限 + 网关超时',
        kind: 'fields',
        fields: [
          { group: 'credentials', key: 'aliyun_access_key_id', label: 'AccessKey ID' },
          { group: 'credentials', key: 'aliyun_access_key_secret', label: 'AccessKey Secret' },
          { group: 'credentials', key: 'oss_sts_role_arn', label: 'STS RoleArn' },
          { group: 'oss', key: 'session_name', label: 'STS 会话名' },
          { group: 'oss', key: 'sts_duration_seconds', label: 'STS 凭证有效期', suffix: '秒', min: 900, max: 43200 },
          { group: 'oss', key: 'max_upload_bytes', label: '最大上传大小', suffix: '字节', min: 0 },
          { group: 'gateway', key: 'oss_timeout_seconds', label: 'OSS 网关超时', suffix: '秒', min: 1, max: 600 },
        ],
      },
      {
        key: 'audit_archive',
        title: '审计归档桶',
        icon: 'inventory_2',
        description: '独立 OSS 桶 + 读写分离子账号 + Compliance 保留期；详见审计归档桶部署指南',
        kind: 'fields',
        fields: [
          { group: 'audit_archive', key: 'bucket', label: '归档桶名' },
          { group: 'audit_archive', key: 'endpoint', label: '公网 Endpoint' },
          { group: 'audit_archive', key: 'internal_endpoint', label: '内网 Endpoint' },
          { group: 'audit_archive', key: 'writer_ak_id', label: '写账号 AK ID' },
          { group: 'audit_archive', key: 'writer_ak_secret', label: '写账号 AK Secret' },
          { group: 'audit_archive', key: 'reader_ak_id', label: '读账号 AK ID' },
          { group: 'audit_archive', key: 'reader_ak_secret', label: '读账号 AK Secret' },
          { group: 'audit_archive', key: 'retention_days', label: '最短保留天数', suffix: '天', min: 1 },
          { group: 'audit_archive', key: 'cutoff_days', label: 'DB 冷数据判定', suffix: '天', min: 1 },
          { group: 'audit_archive', key: 'cron_expr', label: '归档调度 Cron' },
          { group: 'audit_archive', key: 'batch_size', label: '单次处理条数', suffix: '条', min: 100 },
        ],
      },
      {
        key: 'nas',
        title: 'NAS 归档',
        icon: 'storage',
        description: '群晖 NAS 冷归档 Agent；Token 重新生成会立即使旧 Token 失效',
        kind: 'nas',
      },
      {
        key: 'sms',
        title: '短信服务',
        icon: 'sms',
        description: '阿里云短信 OpenAPI（与 OSS / 监控使用不同子账号）',
        kind: 'fields',
        fields: [
          { group: 'sms', key: 'access_key_id', label: 'AccessKey ID' },
          { group: 'sms', key: 'access_key_secret', label: 'AccessKey Secret' },
          { group: 'sms', key: 'region', label: '区域' },
          { group: 'sms', key: 'sign_name', label: '短信签名' },
          { group: 'sms', key: 'template_code', label: '短信模板编号' },
        ],
      },
      {
        key: 'monitor',
        title: '平台监控',
        icon: 'monitoring',
        description: '只读 RAM 子账号（CloudMonitor / ECS / HBR）+ 资源 ID + SSL 证书目录',
        kind: 'fields',
        fields: [
          { group: 'aliyun', key: 'monitor_ak_id', label: '监控 AK ID' },
          { group: 'aliyun', key: 'monitor_ak_secret', label: '监控 AK Secret' },
          { group: 'aliyun', key: 'region', label: 'ECS 地域' },
          { group: 'aliyun', key: 'ecs_instance_id', label: 'ECS 实例 ID' },
          { group: 'aliyun', key: 'ecs_disk_id', label: '系统盘 ID' },
          { group: 'aliyun', key: 'hbr_vault_id', label: 'HBR 备份库 ID' },
          { group: 'platform', key: 'cert_dir', label: 'SSL 证书目录' },
        ],
      },
    ],
  },
  {
    key: 'third-party',
    title: '集成 · 第三方服务',
    hint: 'SSO / AI / MQTT / 安全凭据',
    sections: [
      {
        key: 'sso',
        title: '单点登录 (SSO)',
        icon: 'login',
        description: 'OIDC Client + 服务账号 + Token 缓存 + 网关超时',
        kind: 'fields',
        fields: [
          { group: 'credentials', key: 'sso_client_id', label: 'Client ID' },
          { group: 'credentials', key: 'sso_client_secret', label: 'Client Secret' },
          { group: 'credentials', key: 'sso_redirect_uri', label: '回调地址' },
          { group: 'credentials', key: 'sso_admin_username', label: '服务账号用户名' },
          { group: 'credentials', key: 'sso_admin_password', label: '服务账号密码' },
          { group: 'cache', key: 'sso_token_ttl_hours', label: 'access_token 缓存', suffix: '小时', min: 1 },
          { group: 'cache', key: 'sso_refresh_token_ttl_hours', label: 'refresh_token 缓存', suffix: '小时', min: 1 },
          { group: 'gateway', key: 'sso_timeout_seconds', label: '网关超时', suffix: '秒', min: 1 },
        ],
      },
      {
        key: 'dashscope',
        title: '百炼 AI（DashScope）',
        icon: 'smart_toy',
        description: 'Qwen 大模型 API Key + 网关超时',
        kind: 'fields',
        fields: [
          { group: 'credentials', key: 'dashscope_api_key', label: 'API Key' },
          { group: 'gateway', key: 'qwen_timeout_seconds', label: 'Qwen 网关超时', suffix: '秒', min: 1 },
        ],
      },
      {
        key: 'emqx',
        title: 'EMQX MQTT',
        icon: 'cell_tower',
        description: 'MQTT 服务端密码 + KeepAlive + 各类超时 + 消息去重',
        kind: 'fields',
        fields: [
          { group: 'credentials', key: 'emqx_server_password', label: '服务端密码' },
          { group: 'mqtt', key: 'keep_alive_seconds', label: 'KeepAlive', suffix: '秒', min: 1 },
          { group: 'mqtt', key: 'connect_timeout_seconds', label: '连接超时', suffix: '秒', min: 1 },
          { group: 'mqtt', key: 'publish_timeout_seconds', label: '发布超时', suffix: '秒', min: 1 },
          { group: 'mqtt', key: 'subscribe_timeout_seconds', label: '订阅超时', suffix: '秒', min: 1 },
          { group: 'mqtt', key: 'connect_retry_interval_seconds', label: '重连重试间隔', suffix: '秒', min: 1 },
          { group: 'mqtt', key: 'max_reconnect_interval_seconds', label: '最大重连间隔', suffix: '秒', min: 1 },
          { group: 'cache', key: 'mqtt_dedup_ttl_minutes', label: '消息去重 TTL', suffix: '分钟', min: 1 },
          { group: 'gateway', key: 'emqx_timeout_seconds', label: 'EMQX 网关超时', suffix: '秒', min: 1 },
        ],
      },
      {
        key: 'mdm',
        title: 'MDM 设备管理',
        icon: 'devices',
        description: 'MDM 网关超时（占位，未来扩展）',
        kind: 'fields',
        fields: [
          { group: 'gateway', key: 'mdm_timeout_seconds', label: 'MDM 网关超时', suffix: '秒', min: 1 },
        ],
      },
      {
        key: 'security',
        title: '安全凭据',
        icon: 'security',
        description: 'JWT 签名密钥 + 审计日志正文最大长度',
        kind: 'fields',
        fields: [
          { group: 'credentials', key: 'jwt_secret', label: 'JWT 签名密钥' },
          { group: 'general', key: 'audit_log_max_length', label: '审计日志正文最大长度', suffix: '字符', min: 100 },
        ],
      },
    ],
  },
  {
    key: 'business',
    title: '业务参数',
    hint: '运维管理员调优',
    sections: [
      {
        key: 'cache-ttl',
        title: '缓存 TTL',
        icon: 'schedule',
        description: '业务数据的 Redis 缓存过期时间',
        kind: 'fields',
        fields: [
          { group: 'cache', key: 'device_status_ttl_hours', label: '设备状态', suffix: '小时', min: 1 },
          { group: 'cache', key: 'hall_scene_ttl_hours', label: '展厅场景', suffix: '小时', min: 1 },
          { group: 'cache', key: 'hall_show_ttl_hours', label: '展厅演出', suffix: '小时', min: 1 },
          { group: 'cache', key: 'ai_conversation_ttl_minutes', label: 'AI 会话', suffix: '分钟', min: 1 },
        ],
      },
      {
        key: 'content-proc',
        title: '内容处理',
        icon: 'movie_filter',
        description: '缩略图 / 取帧 / 雪碧图 / AI 标签 / 任务重试 / 下载链接 TTL',
        kind: 'fields',
        fields: [
          { group: 'content', key: 'thumbnail_width', label: '缩略图宽度', suffix: 'px', min: 1 },
          { group: 'content', key: 'thumbnail_height', label: '缩略图高度', suffix: 'px', min: 1 },
          { group: 'content', key: 'frame_interval_ms', label: '视频取帧间隔', suffix: 'ms', min: 100 },
          { group: 'content', key: 'frames_per_sprite', label: '每张雪碧图帧数', suffix: '帧', min: 1 },
          { group: 'content', key: 'sprite_cols', label: '雪碧图列数', suffix: '列', min: 1 },
          { group: 'content', key: 'ai_tag_segment_ms', label: 'AI 标签分段时长', suffix: 'ms', min: 1000 },
          { group: 'content', key: 'task_max_retry', label: '任务最大重试次数', suffix: '次', min: 0 },
          { group: 'content', key: 'download_url_expire_seconds', label: '下载链接有效期', suffix: '秒', min: 60 },
        ],
      },
      {
        key: 'cmd',
        title: '指令与控制',
        icon: 'sync',
        description: '指令 ACK 超时与重试 + 心跳缓存',
        kind: 'fields',
        fields: [
          { group: 'cmd_ack', key: 'pending_ttl_seconds', label: '指令待确认 TTL', suffix: '秒', min: 1 },
          { group: 'cmd_ack', key: 'ack_timeout_seconds', label: 'ACK 超时', suffix: '秒', min: 1 },
          { group: 'cmd_ack', key: 'max_retry', label: '最大重试次数', suffix: '次', min: 0 },
          { group: 'cmd_ack', key: 'retry_interval_seconds', label: '重试间隔', suffix: '秒', min: 1 },
          { group: 'general', key: 'heartbeat_ttl_hours', label: '心跳缓存 TTL', suffix: '小时', min: 1 },
        ],
      },
      {
        key: 'smarthome',
        title: '智能家居',
        icon: 'home_iot_device',
        description: 'Hue / 小米 网关轮询、离线判定、阈值告警',
        kind: 'fields',
        fields: [
          { group: 'smarthome', key: 'smarthome_master_key', label: '凭据加密主密钥' },
          { group: 'smarthome', key: 'hue_poll_interval_ms', label: 'Hue 轮询间隔', suffix: 'ms', min: 100 },
          { group: 'smarthome', key: 'xiaomi_poll_interval_ms', label: '小米轮询间隔', suffix: 'ms', min: 100 },
          { group: 'smarthome', key: 'offline_threshold_count', label: '离线判定连续失败次数', suffix: '次', min: 1 },
          { group: 'smarthome', key: 'battery_low_threshold', label: '低电量告警阈值', suffix: '%', min: 1, max: 100 },
          { group: 'smarthome', key: 'rule_anomaly_threshold', label: '规则异常触发阈值', suffix: '次/小时', min: 1 },
        ],
      },
    ],
  },
  {
    key: 'advanced',
    title: '高级',
    hint: '罕用参数，仅超管修改',
    sections: [
      {
        key: 'pagination',
        title: '分页默认值',
        icon: 'pages',
        description: '影响所有列表的默认 / 最大分页大小',
        kind: 'fields',
        fields: [
          { group: 'general', key: 'page_size_default', label: '默认每页条数', suffix: '条', min: 1, max: 1000 },
          { group: 'general', key: 'page_size_max', label: '最大每页条数', suffix: '条', min: 1, max: 1000 },
        ],
      },
      {
        key: 'device-mgmt',
        title: '设备管理',
        icon: 'developer_board',
        description: 'raw_transport inline 命令清单的 UX 开关；服务端引用方守卫不受影响',
        kind: 'fields',
        fields: [
          {
            group: 'device_mgmt',
            key: 'inline_command_code_autogen_enabled',
            label: 'inline_commands ID 自动生成',
          },
        ],
      },
    ],
  },
];

/** 收集 IA 中用到的所有物理 group（用于一次性预加载缓存） */
export function collectPhysicalGroups(): string[] {
  const set = new Set<string>();
  IA.forEach((cat) => {
    cat.sections.forEach((sec) => {
      if (sec.kind === 'branding') set.add('branding');
      else if (sec.kind === 'nas') set.add('nas');
      else if (sec.kind === 'fields' && sec.fields) {
        sec.fields.forEach((f) => set.add(f.group));
      }
    });
  });
  return Array.from(set);
}

/** 收集一个 Section 涉及的物理 group */
export function sectionGroups(section: Section): string[] {
  if (section.kind === 'fields' && section.fields) {
    return Array.from(new Set(section.fields.map((f) => f.group)));
  }
  if (section.kind === 'branding') return ['branding'];
  if (section.kind === 'nas') return ['nas'];
  return [];
}
