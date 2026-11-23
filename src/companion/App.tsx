import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Banni from './guest/Banni';
import OpenLink from './guest/OpenLink';
import GuestApp from './guest/GuestApp';
import GeneralInvite from './guest/GeneralInvite';
import Admin from './admin/Admin';
import { WEDDING_SLUG } from './lib/wedding';

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
    <Route path="/invitation/*" element={<GeneralInvite />} />
    <Route path="/celebrate/*" element={<LegacyInvitation />} />
    <Route path="/rsvp" element={<FamilyEntry />} />
    <Route path="/i/:token" element={<Banni />} />
    <Route path="/e/:slug" element={<FamilyEntry />} />
    <Route path="/g/:token/*" element={<GeneralInvite />} />
    <Route path="/app/*" element={<GuestApp />} />
    <Route path="/admin/*" element={<Admin />} />
    <Route path="*" element={<Home />} />
  </Routes>;
}
