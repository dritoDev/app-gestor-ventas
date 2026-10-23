'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { ArrowUpRight, Boxes, ChartNoAxesCombined, ChevronDown, CircleHelp, LayoutDashboard, LogOut, Menu, Package, PanelLeftClose, ShoppingBag } from 'lucide-react';
import type { User } from '@gestor/shared';
import { api } from '@/lib/api';

const links = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/sales', label: 'Ventas', icon: ShoppingBag },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/inventory', label: 'Almacén', icon: Boxes },
];
const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { let live = true; api<{ user: User }>('/auth/me').then(data => { if (live) setUser(data.user); }).catch(() => { if (live) router.replace('/login'); }); return () => { live = false; }; }, [router]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { router.replace('/login'); router.refresh(); } };
  if (!user) return <div className="loading-screen"><div className="brand-mark">m<span>.</span></div><p>Preparando tu espacio de trabajo...</p></div>;
  return <UserContext.Provider value={user}><div className="app-shell">
    {menuOpen && <button className="mobile-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><Link href="/dashboard" className="brand"><span className="brand-mark">m<span>.</span></span><span className="brand-word">mercato<small>WORKSPACE</small></span></Link><button className="sidebar-collapse icon-button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><PanelLeftClose size={19} /></button></div>
      <div className="sidebar-section-label">ESPACIO DE TRABAJO</div>
      <nav className="sidebar-nav" aria-label="Navegación principal">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{pathname === href && <span className="nav-indicator" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><ChartNoAxesCombined size={18} /></span><strong>Todo bajo control.</strong><p>Tus ventas e inventario, en un solo lugar.</p><span className="tip-decoration">↗</span></div><div className="sidebar-help"><CircleHelp size={16} /><span>Panel de administración</span><ArrowUpRight size={14} /></div></div>
    </aside>
    <div className="main-column"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button><span className="breadcrumb-home">Espacio de trabajo</span><span className="breadcrumb-separator">/</span><span className="breadcrumb-current">{links.find(link => link.href === pathname)?.label || 'Panel'}</span></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><div className="header-divider" /><div className="user-menu"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div className="user-details"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Operador'}</small></div><ChevronDown size={15} /><button className="logout-button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={17} /></button></div></div></header><main className="content">{children}</main><footer className="footer">Mercato Workspace <span>·</span> Hecho para hacer crecer tu negocio.</footer></div>
  </div></UserContext.Provider>;
}
