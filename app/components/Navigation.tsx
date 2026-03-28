"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Image as ImageIcon, FileText, LogOut, MoreVertical, Download } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    setShowMenu(false);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      alert("iPhoneの場合はSafariの「共有ボタン」から「ホーム画面に追加」を選んでください。\nAndroid/Chromeの場合はすでにインストールされているか、ブラウザのメニューからアプリをインストールできます。");
    }
  };

  const handleSwitchProfile = () => {
    localStorage.removeItem('boshi_profile');
    window.location.href = '/';
  };

  const navItems = [
    { name: 'チャット', href: '/', icon: MessageCircle },
    { name: '写真', href: 'https://photos.app.goo.gl/U7nscr2zKsxzYZrd6', icon: ImageIcon, external: true },
    { name: 'メモ（共有）', href: '/memos', icon: FileText },
    { name: '', isMenuBtn: true, icon: MoreVertical }
  ];

  return (
    <>
      {/* PC: Sidebar Navigation */}
      <nav className="pc-sidebar glass-panel" style={{ overflow: 'visible' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, background: 'var(--primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>BOSHI×BOSHI Talk</h1>
        </div>
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const linkContent = (
              <div className={`nav-item ${isActive ? 'active' : ''}`}>
                <item.icon size={20} />
                {item.name ? <span style={{ fontWeight: 600 }}>{item.name}</span> : null}
              </div>
            );

            if (item.isMenuBtn) {
              return (
                <div key={item.name} style={{ position: 'relative' }}>
                  <button onClick={() => setShowMenu(!showMenu)} style={{ textDecoration: 'none', color: 'inherit', textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {linkContent}
                  </button>
                  {showMenu && (
                    <div className="glass-panel animate-slide-up" style={{
                      position: 'absolute', bottom: '0', left: '100%', marginLeft: '12px',
                      padding: '8px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '4px',
                      minWidth: '160px', zIndex: 100, border: '1px solid var(--glass-border)'
                    }}>
                      <button onClick={handleInstallClick} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)', width: '100%', textAlign: 'left', borderRadius: '8px' }}>
                        <Download size={18} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>アプリDL</span>
                      </button>
                      <button onClick={handleSwitchProfile} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', width: '100%', textAlign: 'left', borderRadius: '8px' }}>
                        <LogOut size={18} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>切替</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            return item.external ? (
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
      <nav className="mobile-bottom-nav glass-panel" style={{ overflow: 'visible' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const linkContent = (
            <div className={`bottom-nav-item ${isActive ? 'active' : ''}`}>
              <item.icon size={24} />
              {item.name ? <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '4px' }}>{item.name}</span> : null}
            </div>
          );

          if (item.isMenuBtn) {
            return (
              <div key={item.name} style={{ position: 'relative', flex: 1, display: 'flex' }}>
                <button onClick={() => setShowMenu(!showMenu)} style={{ flex: 1, textDecoration: 'none', color: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {linkContent}
                </button>
                {showMenu && (
                  <div className="glass-panel animate-slide-up" style={{
                    position: 'absolute', bottom: '100%', right: '0', marginBottom: '8px', marginRight: '8px',
                    padding: '8px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '4px',
                    minWidth: '160px', zIndex: 100, border: '1px solid var(--glass-border)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                  }}>
                    <button onClick={handleInstallClick} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)', width: '100%', textAlign: 'left', borderRadius: '8px' }}>
                      <Download size={18} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>アプリDL</span>
                    </button>
                    <button onClick={handleSwitchProfile} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', width: '100%', textAlign: 'left', borderRadius: '8px' }}>
                      <LogOut size={18} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>切替</span>
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return item.external ? (
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
      
      {/* Overlay to close menu when clicking outside */}
      {showMenu && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} 
          onClick={() => setShowMenu(false)}
        />
      )}
    </>
  );
}
