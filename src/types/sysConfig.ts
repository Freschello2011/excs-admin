export interface ConfigItem {
  key: string;
  value: string;
  value_type: string;
  is_sensitive: boolean;
  description: string;
}

export interface ConfigGroupData {
  group: string;
  items: ConfigItem[];
}

export interface GroupInfo {
  group: string;
  label: string;
}
