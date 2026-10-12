const activeActivities = new Map<string, number>();

export function beginPwaCriticalActivity(name: string): () => void {
  activeActivities.set(name, (activeActivities.get(name) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const count = activeActivities.get(name) ?? 0;
    if (count <= 1) activeActivities.delete(name);
    else activeActivities.set(name, count - 1);
  };
}

export function hasPwaCriticalActivity(): boolean {
  return activeActivities.size > 0;
}

export async function withPwaCriticalActivity<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const finish = beginPwaCriticalActivity(name);
  try {
    return await operation();
  } finally {
    finish();
  }
}
