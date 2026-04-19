import { z } from 'zod';

/* ==================== Exhibit ==================== */

export const exhibitSchema = z.object({
  name: z.string().min(1, '请输入展项名称').max(100, '展项名称不超过 100 字'),
  description: z.string().max(500, '描述不超过 500 字').optional().default(''),
  sort_order: z.number({ message: '请输入排序号' }).int().min(0, '排序号不小于 0'),
  display_mode: z.enum(['normal', 'simple_fusion'], { message: '请选择显示模式' }),
  simple_fusion_config: z.object({
    projector_count: z.number().int().min(2, '投影数不少于 2'),
    overlap_pixels: z.number().int().min(0, '重叠像素不小于 0'),
  }).optional(),
});

export type ExhibitFormValues = z.infer<typeof exhibitSchema>;

/* ==================== Device ==================== */

export const deviceSchema = z.object({
  hall_id: z.number({ message: '请选择展厅' }),
  exhibit_id: z.number().nullable().optional(),
  name: z.string().min(1, '请输入设备名称').max(100, '设备名称不超过 100 字'),
  device_type: z.enum(
    ['projector', 'player', 'lighting', 'audio', 'sensor', 'relay', 'screen', 'camera', 'custom'],
    { message: '请选择设备类型' },
  ),
  protocol: z.enum(
    ['pjlink', 'tcp', 'rs232', 'rs485', 'artnet', 'modbus', 'osc', 'wol', 'plugin'],
    { message: '请选择协议' },
  ),
  connection_config: z.record(z.string(), z.unknown()).default({}),
  command_template: z.record(z.string(), z.string()).optional(),
});

export type DeviceFormValues = z.infer<typeof deviceSchema>;

/* ==================== Service Period ==================== */

export const servicePeriodSchema = z.object({
  service_start: z.string().min(1, '请选择开始日期'),
  service_end: z.string().min(1, '请选择结束日期'),
  grace_days: z.number({ message: '请输入宽限天数' }).int().min(0, '宽限天数不小于 0').max(30, '宽限天数不超过 30'),
});

export type ServicePeriodFormValues = z.infer<typeof servicePeriodSchema>;

/* ==================== Hall Config ==================== */

export const hallConfigSchema = z.object({
  ai_knowledge_text: z.string().max(10000, '知识文本不超过 10000 字').optional(),
  hall_master_exhibit_id: z.number().nullable().optional(),
  hall_master_fallback_id: z.number().nullable().optional(),
});

export type HallConfigFormValues = z.infer<typeof hallConfigSchema>;

/* ==================== App Instance Bind ==================== */

export const appInstanceBindSchema = z.object({
  exhibit_id: z.number({ message: '请选择展项' }),
  is_hall_master: z.boolean().default(false),
});

export type AppInstanceBindFormValues = z.infer<typeof appInstanceBindSchema>;
