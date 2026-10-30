import React, { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreateDocument from './pages/CreateDocument.jsx';
import DocumentList from './pages/DocumentList.jsx';
import VerifyPayment from './pages/VerifyPayment.jsx';
import UploadFile from './pages/UploadFile.jsx';

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));

  const login = ({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  };
  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  if (!localStorage.getItem('token')) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={login} />} />
      </Routes>
    );
  }
  return (
    <Layout user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<CreateDocument />} />
        <Route path="/documents" element={<DocumentList />} />
        <Route path="/verify" element={<VerifyPayment />} />
        <Route path="/upload" element={<UploadFile />} />
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
