import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Chargement } from './components/ui';
import Connexion from './pages/Connexion';

const TableauDeBord = lazy(() => import('./pages/TableauDeBord'));
const ListeMissions = lazy(() => import('./pages/missions/ListeMissions'));
const FormulaireMission = lazy(() => import('./pages/missions/FormulaireMission'));
const DetailMission = lazy(() => import('./pages/missions/DetailMission'));
const Validations = lazy(() => import('./pages/Validations'));
const ListeNotes = lazy(() => import('./pages/notes/ListeNotes'));
const DetailNote = lazy(() => import('./pages/notes/DetailNote'));
const Avances = lazy(() => import('./pages/Avances'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Calendrier = lazy(() => import('./pages/Calendrier'));
const Parc = lazy(() => import('./pages/parc/Parc'));
const DetailVehicule = lazy(() => import('./pages/parc/DetailVehicule'));
const Reporting = lazy(() => import('./pages/Reporting'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profil = lazy(() => import('./pages/Profil'));
const Utilisateurs = lazy(() => import('./pages/admin/Utilisateurs'));
const Referentiels = lazy(() => import('./pages/admin/Referentiels'));
const Circuits = lazy(() => import('./pages/admin/Circuits'));
const Parametres = lazy(() => import('./pages/admin/Parametres'));
const Journaux = lazy(() => import('./pages/admin/Journaux'));

/** Accès réservé : connexion requise, et permission si indiquée (contrôlée aussi côté API). */
function Protege({ perm, children }) {
  const { utilisateur, chargement, peut } = useAuth();
  const location = useLocation();
  if (chargement) return <Chargement />;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ depuis: location.pathname }} />;
  if (utilisateur.doitChangerMdp && location.pathname !== '/profil') return <Navigate to="/profil?mdp=1" replace />;
  if (perm && !peut(perm)) return <Navigate to="/" replace />;
  return children;
}

const p = (perm, el) => <Protege perm={perm}>{el}</Protege>;

export default function App() {
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route element={p(null, <Layout />)}>
          <Route index element={<TableauDeBord />} />
          <Route path="missions" element={<ListeMissions />} />
          <Route path="missions/nouvelle" element={p('mission:creer', <FormulaireMission />)} />
          <Route path="missions/:id" element={<DetailMission />} />
          <Route path="missions/:id/modifier" element={p('mission:creer', <FormulaireMission />)} />
          <Route path="validations" element={<Validations />} />
          <Route path="notes-frais" element={p('note:saisir', <ListeNotes />)} />
          <Route path="notes-frais/:id" element={p('note:saisir', <DetailNote />)} />
          <Route path="avances" element={p('avance:demander', <Avances />)} />
          <Route path="budgets" element={p('budget:lire', <Budgets />)} />
          <Route path="calendrier" element={p('calendrier:lire', <Calendrier />)} />
          <Route path="parc" element={p('vehicule:lire', <Parc />)} />
          <Route path="parc/:id" element={p('vehicule:lire', <DetailVehicule />)} />
          <Route path="reporting" element={p('reporting:lire', <Reporting />)} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profil" element={<Profil />} />
          <Route path="admin/utilisateurs" element={p('admin:utilisateurs', <Utilisateurs />)} />
          <Route path="admin/referentiels" element={p('admin:referentiels', <Referentiels />)} />
          <Route path="admin/circuits" element={p('admin:referentiels', <Circuits />)} />
          <Route path="admin/parametres" element={p('admin:parametres', <Parametres />)} />
          <Route path="admin/journaux" element={p('admin:audit', <Journaux />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
