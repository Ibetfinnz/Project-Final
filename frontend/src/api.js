const token = () => localStorage.getItem('token');

async function request(path, { method = 'GET', body, raw } = {}) {
  const headers = {};
  if (token()) headers.Authorization = 'Bearer ' + token();
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: payload,
    cache: 'no-store', // ห้ามเบราว์เซอร์แคช/ใช้ 304 กับ API (แก้ polling ค้างที่ processing)
  });
  if (res.status === 401 && token()) {
    localStorage.removeItem('token');
    location.href = '/login';
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `เกิดข้อผิดพลาด (${res.status})`);
  }
  if (raw) return res.blob();
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  blob: (p) => request(p, { raw: true }),
};

export async function openBlob(path) {
  const blob = await api.blob(path);
  window.open(URL.createObjectURL(blob), '_blank');
}