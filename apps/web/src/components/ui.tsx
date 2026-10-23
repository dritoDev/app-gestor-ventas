'use client';
import { useEffect } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}<span className="heading-period">.</span></h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>{children}</div></div>;
}
export function Notice({ message, error, onClose }: { message: string; error?: boolean; onClose: () => void }) {
  useEffect(() => { const timer = setTimeout(onClose, 4500); return () => clearTimeout(timer); }, [message, onClose]);
  return <div className={`notice ${error ? 'notice-error' : ''}`} role="status">{error ? <AlertCircle size={18} /> : <Check size={18} />}<span>{message}</span><button onClick={onClose} aria-label="Cerrar aviso"><X size={16} /></button></div>;
}
export function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{detail}</p></div>; }
export function Loading() { return <div className="loading-content"><div className="spinner" />Cargando datos...</div>; }
