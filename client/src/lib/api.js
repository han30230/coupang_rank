export async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

