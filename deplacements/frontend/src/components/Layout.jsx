import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Plane,
  CheckSquare,
  Receipt,
  Wallet,
  PiggyBank,
  CalendarDays,
  Car,
  BarChart3,
  Bell,
  Users,
  Settings,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  UserCircle,
  GitBranch,
  Database,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { lire } from '../api/client';
import { LIBELLES } from '../lib/format';

/** Menu : chaque entrée n'apparaît que si le rôle détient la permission. */
const MENU = [
  {
    titre: null,
    items: [
      { to: '/', label: 'Tableau de bord', icone: LayoutDashboard, fin: true },
      { to: '/missions', label: 'Missions', icone: Plane },
      { to: '/validations', label: 'À valider', icone: CheckSquare, compteur: 'aValider' },
      { to: '/notes-frais', label: 'Notes de frais', icone: Receipt, perm: 'note:saisir' },
      { to: '/avances', label: 'Avances', icone: Wallet, perm: 'avance:demander' },
      { to: '/calendrier', label: 'Calendrier', icone: CalendarDays, perm: 'calendrier:lire' },
    ],
  },
  {
    titre: 'Gestion',
    items: [
      { to: '/budgets', label: 'Budgets', icone: PiggyBank, perm: 'budget:lire' },
      { to: '/parc', label: 'Parc automobile', icone: Car, perm: 'vehicule:lire' },
      { to: '/reporting', label: 'Reporting', icone: BarChart3, perm: 'reporting:lire' },
    ],
  },
  {
    titre: 'Administration',
    items: [
      { to: '/admin/utilisateurs', label: 'Utilisateurs', icone: Users, perm: 'admin:utilisateurs' },
      { to: '/admin/referentiels', label: 'Référentiels et barèmes', icone: Database, perm: 'admin:referentiels' },
      { to: '/admin/circuits', label: 'Circuits de validation', icone: GitBranch, perm: 'admin:referentiels' },
      { to: '/admin/parametres', label: 'Paramètres', icone: Settings, perm: 'admin:parametres' },
      { to: '/admin/journaux', label: 'Journaux et sauvegardes', icone: ShieldCheck, perm: 'admin:audit' },
    ],
  },
];

function Navigation({ compteurs, onNaviguer }) {
  const { peut } = useAuth();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {MENU.map((groupe, i) => {
        const items = groupe.items.filter((it) => !it.perm || peut(it.perm));
        if (!items.length) return null;
        return (
          <div key={i}>
            {groupe.titre && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70">{groupe.titre}</p>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.fin}
                    onClick={onNaviguer}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <it.icone className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{it.label}</span>
                    {it.compteur && compteurs[it.compteur] > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-brand-900">{compteurs[it.compteur]}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { utilisateur, deconnexion } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [compteurs, setCompteurs] = useState({ notifications: 0, aValider: 0 });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let actif = true;
    const charger = async () => {
      try {
        const [n, m, nf] = await Promise.all([lire('/notifications', { nonLues: 1, limit: 1 }), lire('/missions/a-valider'), lire('/notes-frais/a-valider')]);
        if (actif) setCompteurs({ notifications: n.nonLues, aValider: m.length + nf.length });
      } catch {
        /* silencieux : le prochain cycle réessaiera */
      }
    };
    charger();
    const t = setInterval(charger, 60000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [location.pathname]);

  const sortir = async () => {
    await deconnexion();
    navigate('/connexion');
  };

  const barre = (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-800 to-brand-900">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <img src="/api/public/logo" alt="" className="h-11 w-11 rounded-lg bg-white p-0.5" onError={(e) => (e.currentTarget.src = '/logo.png')} />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-white">Déplacements</p>
          <p className="truncate text-xs text-brand-200">Chambre d'Artisanat Souss Massa</p>
        </div>
      </div>
      <Navigation compteurs={compteurs} onNaviguer={() => setMenuOuvert(false)} />
      <div className="border-t border-white/10 p-3">
        <Link to="/profil" onClick={() => setMenuOuvert(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-brand-100 hover:bg-white/10">
          <UserCircle className="h-8 w-8 shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-white">
              {utilisateur.prenom} {utilisateur.nom}
            </p>
            <p className="truncate text-xs text-brand-200">{LIBELLES.role[utilisateur.role]}</p>
          </div>
        </Link>
        <button onClick={sortir} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{barre}</aside>
      {menuOuvert && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setMenuOuvert(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{barre}</aside>
          <button className="absolute right-3 top-3 rounded-full bg-white p-2 shadow" onClick={() => setMenuOuvert(false)} aria-label="Fermer le menu">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="btn-ghost -ml-2 lg:hidden" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
        <img src="/logo.png" alt="" className="h-8 w-8 lg:hidden" />
        <div className="flex-1" />
        <Link to="/notifications" className="relative rounded-full p-2 text-stone-600 hover:bg-stone-100" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {compteurs.notifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
              {compteurs.notifications > 99 ? '99+' : compteurs.notifications}
            </span>
          )}
        </Link>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
