import React, { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try { onLogin(await api.post('/auth/login', { email, password })); }
    catch (e) { setError(e.message); }
  };
  return (
    <div className="login">
      <h1>เข้าสู่ระบบ</h1>
      {error && <div className="err">{error}</div>}
      <div className="field"><label>อีเมล</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>รหัสผ่าน</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
      <button className="btn green" onClick={submit}>เข้าสู่ระบบ</button>
    </div>
  );
}
