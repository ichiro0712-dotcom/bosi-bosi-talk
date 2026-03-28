"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Image as ImageIcon, FileText, LogOut } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();



  const navItems = [
    { name: 'チャット', href: '/', icon: MessageCircle },
    { name: '写真', href: 'https://photos.app.goo.gl/U7nscr2zKsxzYZrd6', icon: ImageIcon, external: true },
    { name: 'メモ（共有）', href: '/memos', icon: FileText },
    { name: '切替', isButton: true, action: () => { localStorage.removeItem('bosi_profile'); window.location.href = '/'; }, icon: LogOut }
  ];

  return (
    <>
      {/* PC: Sidebar Navigation */}
      <nav className="pc-sidebar glass-panel">
        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, background: 'var(--primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BOSI×BOSI Talk</h1>
        </div>
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const linkContent = (
              <div className={`nav-item ${isActive ? 'active' : ''}`}>
                <item.icon size={20} />
                <span style={{ fontWeight: 600 }}>{item.name}</span>
              </div>
            );

            return item.isButton ? (
              <button key={item.name} onClick={item.action} style={{ textDecoration: 'none', color: 'inherit', textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {linkContent}
              </button>
            ) : item.external ? (
              <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                {linkContent}
              </a>
            ) : (
              <Link key={item.name} href={item.href!} style={{ textDecoration: 'none', color: 'inherit' }}>
                {linkContent}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile: Bottom Navigation */}
      <nav className="mobile-bottom-nav glass-panel">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const linkContent = (
            <div className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
              <item.icon size={24} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>{item.name}</span>
            </div>
          );

          return item.isButton ? (
              <button key={item.name} onClick={item.action} style={{ flex: 1, textDecoration: 'none', color: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                {linkContent}
              </button>
            ) : item.external ? (
              <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                {linkContent}
              </a>
            ) : (
              <Link key={item.name} href={item.href!} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                {linkContent}
              </Link>
            );
        })}
      </nav>
    </>
  );
}
