export type NotificationDetails = {
  capture_id?: string;
  node_id?: string;
  missing_fields?: string[];
  published?: boolean;
  publish_requested?: boolean;
};

export type NotificationPublic = {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  details: NotificationDetails | null;
};

export type NotificationsResponse = {
  notifications: NotificationPublic[];
};
