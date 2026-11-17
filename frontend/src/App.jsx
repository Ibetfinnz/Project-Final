import React, { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components.jsx';
import Login from './pages/commonAR+AP/Login.jsx';
import Dashboard from './pages/AR/Dashboard.jsx';
import DashboardAP from './pages/AP/Dashboard.jsx';
import CreateDocument from './pages/commonAR+AP/CreateDocument.jsx';
import DocumentList from './pages/commonAR+AP/DocumentList.jsx';
import VerifyPayment from './pages/AR/VerifyPayment.jsx';
import VerifyMatching from './pages/AP/VerifyMatching.jsx';
import UploadFile from './pages/commonAR+AP/UploadFile.jsx';
import PaidDocuments from './pages/commonAR+AP/PaidDocuments.jsx';
import ExecDashboard from './pages/EXEC/Dashboard.jsx';
import ExecDocumentsOverview from './pages/EXEC/DocumentsOverview.jsx';

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
        <Route path="/" element={
          user?.role === 'AP' ? <DashboardAP />
            : user?.role === 'EXEC' ? <ExecDashboard />
              : <Dashboard />
        } />
        <Route path="/exec/documents" element={
          user?.role === 'EXEC' ? <ExecDocumentsOverview /> : <Navigate to="/" />
        } />
        <Route path="/create" element={<CreateDocument user={user} />} />
        <Route path="/documents" element={<DocumentList user={user} />} />
        <Route path="/paid" element={<PaidDocuments user={user} />} />
        <Route path="/verify" element={user?.role === 'AP' ? <VerifyMatching /> : <VerifyPayment />} />
        <Route path="/upload" element={<UploadFile user={user} />} />
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
