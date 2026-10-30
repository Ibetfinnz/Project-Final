import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { STATUS } from './format.js';

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, bg: '#eee', fg: '#333' };
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }}>
      <i style={{ background: s.fg }} />{s.label}
    </span>
  );
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1><p>{sub}</p></div>
      <div className="page-head-actions">{children}</div>
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <section className={'card ' + className}>{children}</section>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="ปิด">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function Bell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const load = () => api.get('/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  const toggle = async () => {
    setOpen(!open);
    if (!open && data.unread) { await api.post('/notifications/read'); load(); }
  };
  return (
    <div className="bell-wrap">
      <button className="bell" onClick={toggle} aria-label="การแจ้งเตือน">
        🔔{data.unread > 0 && <b>{data.unread}</b>}
      </button>
      {open && (
        <div className="bell-menu">
          {data.items.length === 0 && <p className="muted pad">ไม่มีการแจ้งเตือน</p>}
          {data.items.map((n) => (
            <button key={n.id} className={n.is_read ? '' : 'unread'} onClick={() => { setOpen(false); n.link && nav(n.link); }}>
              {n.message}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- เมนูด้านข้าง ---------- */
const NavIcon = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const NAV = [
  { to: '/', label: 'แดชบอร์ดรายรับ', icon: <path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z" /> },
  { to: '/create', label: 'สร้างและส่งเอกสาร', icon: <path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8l-5-5zM14 3v5h5M12 11v6M9 14h6" /> },
  { to: '/documents', label: 'รายการเอกสารรายรับ', icon: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
  { to: '/verify', label: 'ตรวจสอบหลักฐานการชำระเงิน', icon: <path d="M3 5h18v14H3zM3 10h18M7 15h4" /> },
  { to: '/upload', label: 'อัปโหลดเอกสาร', icon: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" /> },
];

export function Layout({ user, onLogout, children }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8l-5-5zM14 3v5h5" /></svg>
          </span>
          <div>
            <b>IDP System</b>
            <small>Intelligent Document Processing</small>
          </div>
        </div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={n.label}
              className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}>
              <NavIcon>{n.icon}</NavIcon>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-right">
            <Bell />
            <button className="user" onClick={onLogout} title="ออกจากระบบ">
              <span className="avatar">{user?.role || 'AR'}</span>
              <span>{user?.name}</span>
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}