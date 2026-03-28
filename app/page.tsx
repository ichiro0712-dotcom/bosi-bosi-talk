"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Image as ImageIcon, Smile, FilePlus } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import dynamic from 'next/dynamic';

const StampCreatorModal = dynamic(() => import('./components/StampCreatorModal'), { ssr: false });

type Message = { id: number | string; text: string; isMine: boolean; time: string; imageUrl?: string; is_read?: boolean };

// VAPIDキー変換ユーティリティ
function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isDBReady, setIsDBReady] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [isStampModalOpen, setIsStampModalOpen] = useState(false);
  const [myProfile, setMyProfile] = useState<string | null>(null);
  const [isProfileChecking, setIsProfileChecking] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('bosi_profile');
    if (saved) setMyProfile(saved);
    setIsProfileChecking(false);
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    // 過去ログ取得とDB監視
    const initDB = async () => {
      try {
        const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(50);
        if (data) {
          setIsDBReady(true);
          const formatted = data.map(m => ({
            id: m.id, text: m.text, isMine: m.user_id === myProfile,
            time: new Date(m.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
            imageUrl: m.image_url, is_read: m.is_read
          }));
          setMessages(formatted);
          
          // 相手から来た未読メッセージを開いた瞬間に全て「既読」にするアップデート処理
          const unreadFromOther = data.filter(m => m.user_id !== myProfile && !m.is_read).map(m => m.id);
          if (unreadFromOther.length > 0) {
            supabase.from('messages').update({ is_read: true }).in('id', unreadFromOther).then();
          }
        }
      } catch (e) {
        setIsDBReady(false);
      }
    };
    initDB();

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const channel = supabase.channel('public:messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as any;
            setMessages(prev => {
              if (prev.find(p => p.id === newMsg.id)) return prev;
              return [...prev, {
                id: newMsg.id, text: newMsg.text, isMine: newMsg.user_id === myProfile,
                time: new Date(newMsg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                imageUrl: newMsg.image_url, is_read: newMsg.is_read
              }];
            });
            // リアルタイムで受信したら、相手のメッセージのみ「既読」をつける
            setTimeout(() => {
              if (newMsg.user_id !== myProfile) {
                supabase.from('messages').update({ is_read: true }).eq('id', newMsg.id).then();
              }
            }, 500);
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as any;
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, is_read: updatedMsg.is_read } : m));
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [myProfile]);

  // Web Pushの購読登録 (Sw.js)
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        try {
          const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string)
          });
          
          const subJSON = subscription.toJSON();
          if (subJSON.endpoint && subJSON.keys) {
            await supabase.from('subscriptions').upsert({
              endpoint: subJSON.endpoint,
              p256dh: subJSON.keys.p256dh,
              auth: subJSON.keys.auth,
              user_id: myProfile || 'unknown'
            }, { onConflict: 'endpoint' });
          }
        } catch (err) {
          console.warn('Push 購読がスキップされました', err);
        }
      });
    }
  }, []);

  const triggerPushNotification = async (text: string, imageUrl?: string) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: "チームチャット（新規）", body: text || "スタンプが送信されました！", imageUrl })
      });
    } catch(e) { console.error(e); }
  };

  const handleSend = async (textOveride?: string, imgUrl?: string) => {
    const txt = textOveride || inputText;
    if (!txt && !imgUrl) return;
    
    setInputText("");
    
    // 即座に画面へ反映させる（楽観的UI）
    const tempId = Date.now();
    setMessages(prev => [...prev, { id: tempId, text: txt, isMine: true, imageUrl: imgUrl, time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }]);

    // Push通知をバックグラウンドで発火（awaitせずに即次へ）
    triggerPushNotification(txt, imgUrl);

    if (isDBReady && myProfile) {
      // サーバーへ本送信
      const { error } = await supabase.from('messages').insert([{ text: txt, image_url: imgUrl, user_id: myProfile }]);
      if (error) {
        console.error("Message send error", error);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAttachMenu(false);
    const file = e.target.files?.[0];
    if (!file || !isDBReady) return;
    
    // 即時UI反映
    const tempId = Date.now();
    const tempUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, { id: tempId, text: '', isMine: true, imageUrl: tempUrl, time: 'Now' }]);
    
    const filePath = `uploads/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('chat_media').upload(filePath, file);
    if (!error) {
      const { data } = supabase.storage.from('chat_media').getPublicUrl(filePath);
      await supabase.from('messages').insert([{ text: "", image_url: data.publicUrl, user_id: myProfile! }]);
      triggerPushNotification("画像が送信されました", data.publicUrl);
    }
  };

  const handleStampSave = async (base64Image: string) => {
    if (isDBReady && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const res = await fetch(base64Image);
        const blob = await res.blob();
        const filePath = `stamps/${Date.now()}.png`;
        const { error } = await supabase.storage.from('chat_media').upload(filePath, blob, { contentType: 'image/png' });
        
        if (!error) {
           const { data } = supabase.storage.from('chat_media').getPublicUrl(filePath);
           const { error: insertErr } = await supabase.from('messages').insert([{ text: "オリジナルスタンプ！", image_url: data.publicUrl, user_id: myProfile! }]);
           if (!insertErr) {
             triggerPushNotification("オリジナルスタンプ！", data.publicUrl);
           }
        }
      } catch (err) { console.error(err); }
    }
  };

  const sendStampTemplate = (name: string) => {
    setShowStampPicker(false);
    // 自身でDL・配置することを前提に、ローカルURLを参照
    const localUrl = `/stamps/stamp_${name}.svg`;
    
    const tempId = Date.now();
    setMessages(prev => [...prev, { id: tempId, text: '', isMine: true, imageUrl: localUrl, time: 'Now' }]);
    triggerPushNotification("スタンプ！", localUrl);

    if (isDBReady && myProfile) {
      supabase.from('messages').insert([{ text: "", image_url: localUrl, user_id: myProfile }]).then();
    }
  };

  if (isProfileChecking) return null;

  if (!myProfile) {
    return (
      <div style={{height: '100dvh', background: 'var(--bg-gradient)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '40px'}}>
        <h1 style={{color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: 800, textAlign:'center'}}>BOSI×BOSI Talk</h1>
        <p style={{color: 'var(--text-muted)', textAlign:'center', fontWeight:600}}>お使いになるプロフィールを<br/>選んでください</p>
        <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center'}}>
           <button onClick={()=>{localStorage.setItem('bosi_profile','user_a'); setMyProfile('user_a')}} style={{background:'rgba(255,255,255,0.7)', padding:'32px 40px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
             <span style={{fontSize:'3.5rem'}}>🦊</span>
             <span style={{fontSize:'1.1rem', fontWeight:700, color:'var(--text-main)'}}>キツネさん</span>
           </button>
           <button onClick={()=>{localStorage.setItem('bosi_profile','user_b'); setMyProfile('user_b')}} style={{background:'rgba(255,255,255,0.7)', padding:'32px 40px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
             <span style={{fontSize:'3.5rem'}}>🐰</span>
             <span style={{fontSize:'1.1rem', fontWeight:700, color:'var(--text-main)'}}>ウサギさん</span>
           </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="chat-area glass-panel">
        {!isDBReady && (
          <div style={{ padding: '8px 24px', background: 'rgba(244, 63, 94, 0.1)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'center' }}>
            <span style={{fontSize: '0.8rem', color:'#f43f5e', fontWeight: 600}}>※DB未接続（Vercelへのキー反映待ち）</span>
          </div>
        )}
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ alignSelf: msg.isMine ? 'flex-end' : 'flex-start', display: 'flex', flexDirection: 'column', alignItems: msg.isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{
                background: msg.isMine ? 'var(--primary)' : 'rgba(255, 255, 255, 0.95)', padding: '12px 16px', borderRadius: '18px',
                borderBottomRightRadius: msg.isMine ? '4px' : '18px', borderBottomLeftRadius: msg.isMine ? '18px' : '4px',
                color: msg.isMine ? '#ffffff' : 'var(--text-main)', boxShadow: '0 4px 12px rgba(100, 116, 166, 0.08)', width: 'fit-content'
              }}>
                {msg.text && <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }}>{msg.text}</div>}
                {msg.imageUrl && <img src={msg.imageUrl} alt="stamp" style={{ width: '180px', height: '180px', objectFit: 'contain', marginTop: msg.text ? '8px' : '0' }} />}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', padding: msg.isMine ? '0 4px 0 0' : '0 0 0 4px' }}>
                {msg.isMine && msg.is_read && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>既読</span>}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{msg.time}</span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ position: 'relative', padding: '16px', borderTop: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
          {showAttachMenu && (
            <div className="animate-slide-up" style={{
              position: 'absolute', bottom: '80px', left: '16px', background: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '16px', boxShadow: 'var(--shadow-soft)',
              display: 'flex', gap: '20px', zIndex: 50, border: '1px solid var(--glass-border)'
            }}>
              <input type="file" id="media-upload" accept="image/*,video/*" style={{display:'none'}} onChange={handleFileUpload} />
              
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', cursor:'pointer'}} onClick={() => document.getElementById('media-upload')?.click()}>
                <div style={{background:'#e2e8f0', borderRadius:'50%', width:50, height:50, display:'flex', alignItems:'center', justifyContent:'center', color:'#475569'}}><ImageIcon size={24} /></div>
                <span style={{fontSize:'0.75rem', fontWeight:600, color:'var(--text-muted)'}}>画像・動画</span>
              </div>
              
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', cursor:'pointer'}} onClick={() => {setShowAttachMenu(false); setShowStampPicker(true);}}>
                <div style={{background:'#fce7f3', borderRadius:'50%', width:50, height:50, display:'flex', alignItems:'center', justifyContent:'center', color:'#db2777'}}><Smile size={24} /></div>
                <span style={{fontSize:'0.75rem', fontWeight:600, color:'var(--text-muted)'}}>スタンプ</span>
              </div>
              
              <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', cursor:'pointer'}} onClick={() => {setShowAttachMenu(false); setIsStampModalOpen(true);}}>
                <div style={{background:'#dbeafe', borderRadius:'50%', width:50, height:50, display:'flex', alignItems:'center', justifyContent:'center', color:'#2563eb'}}><FilePlus size={24} /></div>
                <span style={{fontSize:'0.75rem', fontWeight:600, color:'var(--text-muted)'}}>スタンプ作成</span>
              </div>
            </div>
          )}

          {showStampPicker && (
            <div className="animate-slide-up" style={{
              position: 'absolute', bottom: '80px', left: '16px', right: '16px', background: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(20px)', borderRadius: '20px', padding: '16px', boxShadow: 'var(--shadow-soft)', zIndex: 51,
              border: '1px solid var(--glass-border)'
            }}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px', alignItems:'center'}}>
                <h4 style={{margin:0, color:'var(--text-main)'}}>デフォルトスタンプを選ぶ</h4>
                <button onClick={() => setShowStampPicker(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'var(--text-muted)'}}>×</button>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'10px', overflowY:'auto', maxHeight:'240px'}}>
                {['ok','thanks','cheers','wow','sorry','yes','thinking','nod','roger','love'].map(name => (
                  <div key={name} onClick={() => sendStampTemplate(name)} style={{aspectRatio:'1/1', background:'#f8fafc', borderRadius:'12px', overflow:'hidden', cursor:'pointer', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <img src={`/stamps/stamp_${name}.svg`} alt={name} style={{width:'90%', height:'90%', objectFit:'contain'}} onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.parentElement!.innerHTML = '<span style="font-size:0.7rem;color:#94a3b8">DL待機</span>'; }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.65)', border: '1px solid var(--glass-border)', borderRadius: '24px', padding: '8px 16px', alignItems: 'center', gap: '12px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
            <button onClick={() => {setShowAttachMenu(!showAttachMenu); setShowStampPicker(false);}} style={{ color: 'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:'4px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', transition:'0.2s', backgroundColor: showAttachMenu ? 'rgba(0,0,0,0.05)' : 'transparent' }}>
              <Plus size={24} style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition: 'all 0.2s' }} />
            </button>
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="メッセージを入力してください... (送信はEnter)" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontSize: '1rem', padding: '8px 0' }} />
            <button onClick={() => handleSend()} style={{ background: inputText ? 'var(--primary-hover)' : '#e2e8f0', color: inputText ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: inputText ? 'pointer' : 'default', transition: 'all 0.2s' }}>
              <Send size={18} style={{ transform: 'translate(1px, 1px)' }} />
            </button>
          </div>
        </div>
      </div>
      {isStampModalOpen && <StampCreatorModal onClose={() => setIsStampModalOpen(false)} onSave={handleStampSave} />}
    </>
  );
}
