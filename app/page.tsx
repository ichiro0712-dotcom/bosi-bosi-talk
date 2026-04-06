"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase/client';
import { Image as ImageIcon, Heart } from 'lucide-react';
import dynamic from 'next/dynamic';

const AnniversaryModal = dynamic(() => import('./components/AnniversaryModal'), { ssr: false });

export default function Home() {
  const [myProfile, setMyProfile] = useState<string | null>(null);
  const [isProfileChecking, setIsProfileChecking] = useState(true);
  const [settings, setSettings] = useState<{ anniversary_date: string | null; top_image_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnnivModal, setShowAnnivModal] = useState(false);
  
  const timerRef = useRef<any>(null);

  const postMochiMessage = async (text: string) => {
    const profile = localStorage.getItem('boshi_profile');
    if (!profile) return;
    
    // DB挿入
    const { error: dbErr } = await supabase.from('messages').insert([{
      text: text,
      user_id: 'mochi'
    }]);
    if (dbErr) {
      console.error("Mochi msg insert error:", dbErr);
    }

    // プッシュ通知
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "もち 🍡",
          body: text,
          senderUserId: profile // 自身には通知を送らない制御用
        })
      });
    } catch (e) {
      console.error("Notification API error:", e);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
    if (saved) setMyProfile(saved);
    setIsProfileChecking(false);
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    fetchSettings();
  }, [myProfile, showAnnivModal]); // モーダルを閉じたときに再フェッチする

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('couple_settings').select('*').limit(1).single();
    if (data) setSettings(data);
    setLoading(false);
  };

  const calculateCounters = () => {
    if (!settings?.anniversary_date) return null;
    const start = new Date(settings.anniversary_date);
    start.setHours(0, 0, 0, 0); // JST -> local
    // If the database date is "2020-04-10", start will be interpreted correctly in local TZ by default, but let's be safe.
    // Instead of raw new Date, let's parse YYYY-MM-DD
    const [y, m, d] = settings.anniversary_date.split('-');
    const startDate = new Date(Number(y), Number(m) - 1, Number(d));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // つきあってから何年何日
    let diffTime = today.getTime() - startDate.getTime();
    if (diffTime < 0) diffTime = 0; // まだきていない場合
    const totalDaysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    let years = today.getFullYear() - startDate.getFullYear();
    let anniversaryThisYear = new Date(today.getFullYear(), startDate.getMonth(), startDate.getDate());
    
    // まだ今年の記念日が来ていない場合
    if (today < anniversaryThisYear) {
      years--;
    }
    
    let passedAnnivDate = new Date(today.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (today < passedAnnivDate) {
      passedAnnivDate.setFullYear(today.getFullYear() - 1);
    }
    const daysSinceLastAnniv = Math.floor((today.getTime() - passedAnnivDate.getTime()) / (1000 * 60 * 60 * 24));


    // 今年の記念日まであと何日
    let nextAnniversary = new Date(today.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (today > nextAnniversary) {
      nextAnniversary.setFullYear(today.getFullYear() + 1);
    }
    const daysUntilNext = Math.floor((nextAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      totalDaysSince,
      years,
      daysSinceLastAnniv,
      daysUntilNext
    };
  };

  // 長押し判定用
  const handleTouchStart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      document.getElementById('top-image-upload')?.click();
      timerRef.current = null;
    }, 800); // 800ms
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleCounterTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowAnnivModal(true);
      timerRef.current = null;
    }, 800);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // アップロード中は仮に見せる（オプティミスティックUI）
    const tempUrl = URL.createObjectURL(file);
    setSettings(prev => prev ? { ...prev, top_image_url: tempUrl } : { anniversary_date: null, top_image_url: tempUrl });
    // inputをクリアして再選択可能にする
    e.target.value = '';

    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `top_images/${Date.now()}_bg.${ext}`;
    const { error } = await supabase.storage.from('chat_media').upload(filePath, file, { cacheControl: '3600', upsert: true });
    
    if (!error) {
       const { data } = supabase.storage.from('chat_media').getPublicUrl(filePath);
       let query = supabase.from('couple_settings');
       
       let dbErr = null;
       if (settings && (settings as any).id) {
         const { error: updateErr } = await query.update({ top_image_url: data.publicUrl }).eq('id', (settings as any).id);
         dbErr = updateErr;
       } else {
         const { error: insertErr } = await query.upsert({ top_image_url: data.publicUrl });
         dbErr = insertErr;
       }
       
       if (dbErr) {
         alert("データベース保存エラー: " + dbErr.message);
         console.error(dbErr);
         return;
       }
       
       const profile = localStorage.getItem('boshi_profile');
       const userName = profile === 'user_a' ? 'ミルク' : profile === 'user_b' ? 'メリー' : '誰か';
       await postMochiMessage(`${userName}さんが、トップ画面の背景画像を変更しました！📸`);
       
       // ローカルのStateだけを更新し、fetchSettings()のようなLoadingUIを出さない（ちらつき防止）
       setSettings(prev => prev ? { ...prev, top_image_url: data.publicUrl } : { anniversary_date: null, top_image_url: data.publicUrl });
    } else {
       alert("画像のアップロードエラー: " + error.message);
       console.error("Upload error:", error);
       fetchSettings(); // reverting
    }
  };

  if (isProfileChecking) return null;

  if (!myProfile) {
    return (
      <div style={{height: '100dvh', background: 'var(--bg-gradient)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '40px'}}>
        <h1 style={{color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: 800, textAlign:'center'}}>BOSHI×BOSHI Talk</h1>
        <p style={{color: 'var(--text-muted)', textAlign:'center', fontWeight:600}}>お使いになるプロフィールを<br/>選んでください</p>
        <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center'}}>
           <button onClick={()=>{localStorage.setItem('boshi_profile','user_a'); setMyProfile('user_a')}} style={{background:'rgba(255,255,255,0.7)', padding:'24px 32px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
             <img src="/stamps/stamp_custom_41.png" alt="ミルク" style={{width: '80px', height: '80px', objectFit: 'contain'}} />
             <span style={{fontSize:'1.1rem', fontWeight:700, color:'var(--text-main)'}}>ミルク</span>
           </button>
           <button onClick={()=>{localStorage.setItem('boshi_profile','user_b'); setMyProfile('user_b')}} style={{background:'rgba(255,255,255,0.7)', padding:'24px 32px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
             <img src="/stamps/stamp_custom_59.png" alt="メリー" style={{width: '80px', height: '80px', objectFit: 'contain'}} />
             <span style={{fontSize:'1.1rem', fontWeight:700, color:'var(--text-main)'}}>メリー</span>
           </button>
        </div>
      </div>
    );
  }

  const counters = calculateCounters();

  return (
    <div 
      style={{ 
        height: '100dvh', 
        width: '100%',
        position: 'relative',
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: settings?.top_image_url ? '#000' : 'var(--bg-gradient)',
        overflow: 'hidden'
      }}
      onContextMenu={(e) => { e.preventDefault(); document.getElementById('top-image-upload')?.click(); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {/* Background Image */}
      {settings?.top_image_url && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `url(${settings.top_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.85,
          zIndex: 0
        }} />
      )}
      
      {/* Gradient Overlay for Text Readability */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.6) 100%)',
        zIndex: 1,
        pointerEvents: 'none'
      }} />

      {/* Hidden File Input */}
      <input type="file" id="top-image-upload" accept="image/*" style={{display:'none'}} onChange={handleFileUpload} />

      {/* Content */}
      <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', width: '100%', maxWidth: '400px', marginTop: '10px' }}>
        
        {loading ? (
          <p style={{color: 'white', fontWeight: 600}}>Loading...</p>
        ) : (
          <>
            <div className="glass-panel animate-slide-up" 
                 onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowAnnivModal(true); }}
                 onTouchStart={handleCounterTouchStart}
                 onTouchEnd={handleTouchEnd}
                 onMouseDown={handleCounterTouchStart}
                 onMouseUp={handleTouchEnd}
                 onMouseLeave={handleTouchEnd}
                 style={{ 
              background: 'rgba(255,255,255,0.15)', 
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '24px', 
              padding: '16px 20px', 
              width: '100%',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '12px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              cursor: 'pointer'
            }}>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Heart fill="#f43f5e" color="#f43f5e" size={20} className="animate-pulse" />
              </div>

              {counters ? (
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginBottom: '2px' }}>つきあった日まで あと</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>
                      {counters.daysUntilNext}<span style={{ fontSize: '0.9rem', marginLeft: '2px' }}>日</span>
                    </div>
                  </div>

                  <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.2)' }} />

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: '2px' }}>つきあってから</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'baseline' }}>
                      {counters.years > 0 ? <>{counters.years}<span style={{fontSize:'0.8rem', marginRight:'4px'}}>年と</span></> : ''}
                      {counters.daysSinceLastAnniv}<span style={{fontSize:'0.8rem'}}>日</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'white' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>記念日が未設定です</p>
                  <p style={{ fontSize: '0.7rem', opacity: 0.8, margin: 0 }}>長押しして登録してください</p>
                </div>
              )}
            </div>
            
            <div className="animate-slide-up" style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ImageIcon size={12} /> 何もない場所を長押しすると背景画像を変更できます
            </div>
          </>
        )}
      </div>

      {showAnnivModal && <AnniversaryModal onClose={() => setShowAnnivModal(false)} />}
    </div>
  );
}
