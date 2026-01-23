import { useEffect, useMemo, useState } from "react";
import { getUploadQueue, type UploadQueueItemView, type UploadQueueSnapshot } from "./uploadQueue";

export type UseUploadQueueResult = {
  initialized: boolean;
  persistenceError?: string;
  items: UploadQueueItemView[];
  pendingCount: number;
  uploadingCount: number;
  failedCount: number;
  enqueue: ReturnType<typeof getUploadQueue>["enqueue"];
  retryNow: ReturnType<typeof getUploadQueue>["retryNow"];
  remove: ReturnType<typeof getUploadQueue>["remove"];
};

export function useUploadQueue(): UseUploadQueueResult {
  const queue = useMemo(() => getUploadQueue(), []);
  const [snapshot, setSnapshot] = useState<UploadQueueSnapshot>(() => queue.getSnapshot());

  useEffect(() => {
    const unsubscribe = queue.subscribe((next) => setSnapshot(next));
    void queue.ensureInitialized();
    return unsubscribe;
  }, [queue]);

  const pendingCount = snapshot.items.filter((i) => i.status === "pending").length;
  const uploadingCount = snapshot.items.filter((i) => i.status === "uploading").length;
  const failedCount = snapshot.items.filter((i) => i.status === "failed").length;

  return {
    initialized: snapshot.initialized,
    persistenceError: snapshot.persistenceError,
    items: snapshot.items,
    pendingCount,
    uploadingCount,
    failedCount,
    enqueue: queue.enqueue.bind(queue),
    retryNow: queue.retryNow.bind(queue),
    remove: queue.remove.bind(queue)
  };
}

