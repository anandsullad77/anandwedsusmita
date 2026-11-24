import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Banni from './guest/Banni';
import OpenLink from './guest/OpenLink';
import GuestApp from './guest/GuestApp';
import GeneralInvite from './guest/GeneralInvite';
import Admin from './admin/Admin';
import { ForgotHostPassword, ResetHostPassword } from './admin/HostPasswordRecovery';
import { WEDDING_SLUG } from './lib/wedding';
import AuthCallback from './guest/AuthCallback';
import FamilySignInGate from './components/FamilySignInGate';

function Home() {
  useEffect(() => { window.location.replace('/'); }, []);
  return <p><a href="/">Open Anand and Susmita's invitation</a></p>;
}

function FamilyEntry() {
  const { slug } = useParams();
  return !slug || slug === WEDDING_SLUG ? <OpenLink /> : <Home />;
}

function LegacyInvitation() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={{ pathname: `/invitation${pathname.slice('/celebrate'.length)}`, search, hash }} replace />;
}

export default function App() {
  return <Routes>
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/invitation/*" element={<GeneralInvite />} />
    <Route path="/celebrate/*" element={<LegacyInvitation />} />
    <Route path="/rsvp" element={<FamilySignInGate><FamilyEntry /></FamilySignInGate>} />
    <Route path="/i/:token" element={<FamilySignInGate><Banni /></FamilySignInGate>} />
    <Route path="/e/:slug" element={<FamilySignInGate><FamilyEntry /></FamilySignInGate>} />
    <Route path="/g/:token/*" element={<GeneralInvite />} />
    <Route path="/app/*" element={<FamilySignInGate><GuestApp /></FamilySignInGate>} />
    <Route path="/admin/forgot-password" element={<ForgotHostPassword />} />
    <Route path="/admin/reset-password" element={<ResetHostPassword />} />
    <Route path="/admin/*" element={<Admin />} />
    <Route path="*" element={<Home />} />
  </Routes>;
}
