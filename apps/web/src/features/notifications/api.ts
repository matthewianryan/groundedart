import { apiFetch } from "../../api/http";
import type { NotificationPublic, NotificationsResponse } from "./types";

export function listNotifications(init?: RequestInit) {
  return apiFetch<NotificationsResponse>("/v1/me/notifications", init);
}

export function markNotificationRead(notificationId: string) {
  return apiFetch<NotificationPublic>(`/v1/me/notifications/${notificationId}/read`, { method: "POST" });
}
