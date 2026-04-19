export const queryKeys = {
  // auth
  currentUser: ['auth', 'me'] as const,
  users: (params: Record<string, unknown>) => ['auth', 'users', params] as const,
  userDetail: (id: number) => ['auth', 'user', id] as const,

  // hall
  halls: (params: Record<string, unknown>) => ['halls', params] as const,
  hallDetail: (id: number) => ['hall', id] as const,
  hallStatus: (id: number) => ['hall', id, 'status'] as const,
  exhibits: (hallId: number) => ['hall', hallId, 'exhibits'] as const,
  devices: (params: Record<string, unknown>) => ['devices', params] as const,
  effectiveCommands: (deviceId: number) => ['devices', deviceId, 'effective-commands'] as const,
  appInstances: (hallId: number) => ['hall', hallId, 'app-instances'] as const,
  pairingCodes: (hallId: number) => ['hall', hallId, 'pairing-codes'] as const,
  controlAppSessions: (hallId: number) => ['hall', hallId, 'control-app-sessions'] as const,
  announcedDevices: ['announced-devices'] as const,

  // content
  contents: (params: Record<string, unknown>) => ['contents', params] as const,
  contentDetail: (id: number) => ['content', id] as const,
  pipelineStatus: (id: number) => ['content', id, 'pipeline'] as const,
  contentTags: (params: Record<string, unknown>) => ['content-tags', params] as const,
  distributions: (params: Record<string, unknown>) => ['distributions', params] as const,
  ossStats: (hallId: number) => ['oss-stats', hallId] as const,
  unboundContent: (hallId: number) => ['unbound-content', hallId] as const,
  exhibitContent: (exhibitId: number) => ['exhibit', exhibitId, 'content'] as const,
  exhibitTags: (exhibitId: number, params?: Record<string, unknown>) =>
    ['exhibit', exhibitId, 'tags', ...(params ? [params] : [])] as const,
  slideshowConfig: (exhibitId: number) => ['exhibit', exhibitId, 'slideshow'] as const,

  // command
  scenes: (hallId: number) => ['scenes', hallId] as const,
  sceneDetail: (id: number) => ['scene', id] as const,
  touchNav: (exhibitId: number) => ['touch-nav', exhibitId] as const,

  // show
  shows: (params: Record<string, unknown>) => ['shows', params] as const,
  showDetail: (id: number) => ['show', id] as const,
  showVersions: (id: number) => ['show', id, 'versions'] as const,

  // mdm proxy
  mdmCustomers: () => ['mdm', 'customers'] as const,

  // ai
  aiAvatars: (params: Record<string, unknown>) => ['ai', 'avatars', params] as const,
  aiAvatarDetail: (exhibitId: number) => ['ai', 'avatar', exhibitId] as const,
  aiTemplates: ['ai', 'templates'] as const,
  aiTemplateDetail: (id: number) => ['ai', 'template', id] as const,
  aiVoices: ['ai', 'voices'] as const,
  aiKnowledgeFiles: (params: { exhibit_id?: number; hall_id?: number }) => ['ai', 'knowledge-files', params] as const,

  // notification
  notificationConfigs: (hallId: number) => ['notifications', hallId] as const,
  notificationLogs: (params: Record<string, unknown>) => ['notification-logs', params] as const,

  // operation logs
  operationLogs: (params: Record<string, unknown>) => ['operation-logs', params] as const,

  // dashboard
  dashboardStats: ['dashboard', 'stats'] as const,
  dashboardData: ['dashboard', 'data'] as const,

  // panel
  panel: (hallId: number) => ['panel', hallId] as const,

  // sys config
  sysConfigGroups: ['sys-config', 'groups'] as const,
  sysConfigGroup: (group: string) => ['sys-config', group] as const,

  // release
  releases: (params: Record<string, unknown>) => ['releases', params] as const,
  hallAppVersion: (hallId: number) => ['hall', hallId, 'app-version'] as const,

  // smarthome
  hueBridges: (hallId: number) => ['smarthome', 'hue-bridges', hallId] as const,
  xiaomiGateways: (hallId: number) => ['smarthome', 'xiaomi-gateways', hallId] as const,
  smarthomeRules: (hallId: number) => ['smarthome', 'rules', hallId] as const,
  smarthomeRuleDetail: (id: string) => ['smarthome', 'rule', id] as const,
  triggerLogs: (params: Record<string, unknown>) => ['smarthome', 'trigger-logs', params] as const,
  deviceHealth: (hallId: number) => ['smarthome', 'health', hallId] as const,
  gatewayHealth: (hallId: number) => ['smarthome', 'gateway-health', hallId] as const,
  deviceHealthHistory: (deviceId: number) => ['smarthome', 'health-history', deviceId] as const,
  smarthomeAlerts: (hallId: number) => ['smarthome', 'alerts', hallId] as const,

  // device catalog (device-mgmt 改造)
  protocolBaselines: ['protocol-baselines'] as const,
  protocolBaselineDetail: (protocol: string) => ['protocol-baselines', protocol] as const,
  deviceCategories: ['device-categories'] as const,
  deviceSubcategories: (categoryId?: number) =>
    categoryId === undefined
      ? (['device-subcategories'] as const)
      : (['device-subcategories', categoryId] as const),
  deviceBrands: (params?: Record<string, unknown>) => ['device-brands', params ?? {}] as const,
  deviceModels: (params?: Record<string, unknown>) => ['device-models', params ?? {}] as const,
  deviceModelDetail: (id: number) => ['device-model', id] as const,

  // analytics
  usageOverview: (params: Record<string, unknown>) => ['analytics', 'usage-overview', params] as const,
  playbackStats: (params: Record<string, unknown>) => ['analytics', 'playback-stats', params] as const,
  operationStats: (params: Record<string, unknown>) => ['analytics', 'operation-stats', params] as const,
  aiStats: (params: Record<string, unknown>) => ['analytics', 'ai-stats', params] as const,
  ossBrowser: (params: Record<string, unknown>) => ['analytics', 'oss-browser', params] as const,
};
