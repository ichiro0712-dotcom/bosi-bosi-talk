"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Image as ImageIcon, Smile, FilePlus, X, BellRing } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import dynamic from 'next/dynamic';

const StampCreatorModal = dynamic(() => import('./components/StampCreatorModal'), { ssr: false });

type Message = { id: number | string; text: string; isMine: boolean; time: string; timestamp?: number; dateStr?: string; imageUrl?: string; is_read?: boolean; status?: 'sending' | 'sent' };

// OGP機能をキャンセルしたため、シンプルなリンク化のみ提供します。
function renderTextWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }}>
      {parts.map((part, i) => urlRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{color:'inherit', textDecoration:'underline'}}>{part}</a> : part)}
    </div>
  );
}

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>('granted'); // hidden by default unless proven otherwise
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, previewImage]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  // 許可済みの場合はサイレントで購読情報をDBに同期する（テスト端末のデータ欠落防止）
  useEffect(() => {
    if (pushStatus === 'granted' && myProfile && 'serviceWorker' in navigator && 'PushManager' in window && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
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
              user_id: myProfile
            }, { onConflict: 'endpoint' });
          }
        } catch (e) {
          console.warn('Silent push subscription failed', e);
        }
      });
    }
  }, [pushStatus, myProfile]);

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
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
            timestamp: new Date(m.created_at).getTime(),
            dateStr: new Date(m.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
            imageUrl: m.image_url, is_read: m.is_read, status: 'sent' as const
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
              const withoutTemp = prev.filter(m => !(m.id.toString().startsWith('temp_') && m.text === newMsg.text && (m.imageUrl || null) === (newMsg.image_url || null) && m.isMine === (newMsg.user_id === myProfile)));
              return [...withoutTemp, {
                id: newMsg.id, text: newMsg.text, isMine: newMsg.user_id === myProfile,
                time: new Date(newMsg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                timestamp: new Date(newMsg.created_at).getTime(),
                dateStr: new Date(newMsg.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
                imageUrl: newMsg.image_url, is_read: newMsg.is_read, status: 'sent'
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

  // Web Pushの購読登録 (手動許可ボタン用)
  const requestPushPermission = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert("お使いのブラウザはプッシュ通知に対応していません");
      return;
    }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
    
    if (perm === 'granted' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
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
        alert("通知の許可が完了しました！");
      } catch (err) {
        console.error('Push 購読エラー', err);
        alert("通知の設定中にエラーが発生しました。\n※iPhoneの場合は「ホーム画面に追加」から開く必要があります。");
      }
    }
  };

  const triggerPushNotification = async (text: string, imageUrl?: string) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: "BOSHI×BOSHI Talk",
          body: text || "スタンプが送信されました！",
          imageUrl,
          senderUserId: myProfile
        })
      });
    } catch(e: any) {
      console.error(e);
    }
  };


  const handleSend = async (textOveride?: string, imgUrl?: string) => {
    const txt = textOveride || inputText;
    if (!txt && !imgUrl) return;
    
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    // オプティミスティックUI（送信中ステータス付与）
    const tempId = 'temp_' + Date.now() + Math.random().toString(36).substring(7);
    setMessages(prev => [...prev, { id: tempId, text: txt, isMine: true, status: 'sending', time: '送信中', timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }), imageUrl: imgUrl }]);

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
    
    // 送信中ステータスで画面追加
    const tempId = 'temp_' + Date.now() + Math.random().toString(36).substring(7);
    const tempUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, { id: tempId, text: '', isMine: true, status: 'sending', time: '送信中', timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }), imageUrl: tempUrl }]);
    
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
    
    // 即座に送信中を表示
    const tempId = 'temp_' + Date.now();
    setMessages(prev => [...prev, { id: tempId, text: '', isMine: true, status: 'sending', time: '送信中', timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }), imageUrl: localUrl }]);
    triggerPushNotification("スタンプ！", localUrl);

    if (isDBReady && myProfile) {
      supabase.from('messages').insert([{ text: "", image_url: localUrl, user_id: myProfile }]).then();
    }
  };

  if (isProfileChecking) return null;

  if (!myProfile) {
    return (
      <div style={{height: '100dvh', background: 'var(--bg-gradient)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '40px'}}>
        <h1 style={{color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: 800, textAlign:'center'}}>BOSHI×BOSHI Talk</h1>
        <p style={{color: 'var(--text-muted)', textAlign:'center', fontWeight:600}}>お使いになるプロフィールを<br/>選んでください</p>
        <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center'}}>
           <button onClick={()=>{localStorage.setItem('boshi_profile','user_a'); setMyProfile('user_a')}} style={{background:'rgba(255,255,255,0.7)', padding:'32px 40px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
             <span style={{fontSize:'3.5rem'}}>🦊</span>
             <span style={{fontSize:'1.1rem', fontWeight:700, color:'var(--text-main)'}}>キツネさん</span>
           </button>
           <button onClick={()=>{localStorage.setItem('boshi_profile','user_b'); setMyProfile('user_b')}} style={{background:'rgba(255,255,255,0.7)', padding:'32px 40px', borderRadius:'24px', border:'1px solid var(--glass-border)', boxShadow:'var(--shadow-soft)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', transition:'0.2s'}}>
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
        
        {pushStatus === 'denied' && (
          <div style={{ padding: '8px 24px', background: 'rgba(244, 63, 94, 0.1)', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{fontSize: '0.8rem', color:'#f43f5e', fontWeight: 600}}>【通知がブロックされています】</span>
            <span style={{fontSize: '0.7rem', color:'#f43f5e'}}>ブラウザの「サイト設定」から通知のブロックを解除してください</span>
          </div>
        )}

        {pushStatus === 'default' && (
          <div style={{ padding: '12px 24px', background: 'rgba(147, 112, 219, 0.1)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{display:'flex', alignItems:'center', gap:'8px', color:'#9370db'}}>
              <BellRing size={16} />
              <span style={{fontSize: '0.8rem', fontWeight: 600}}>新着メッセージの通知を受け取りますか？</span>
            </div>
            <button onClick={requestPushPermission} style={{ background: '#9370db', color: 'white', padding: '6px 16px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
              許可する
            </button>
          </div>
        )}
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
            const showDate = !prevMsg || prevMsg.dateStr !== msg.dateStr;
            const isGrouped = prevMsg && prevMsg.isMine === msg.isMine && ((msg.timestamp || 0) - (prevMsg.timestamp || 0) < 60000) && !showDate;
            const isNextGrouped = nextMsg && nextMsg.isMine === msg.isMine && ((nextMsg.timestamp || 0) - (msg.timestamp || 0) < 60000) && nextMsg.dateStr === msg.dateStr;

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 16px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.1)', color: '#fff', fontSize: '0.7rem', fontWeight: 600, padding: '4px 12px', borderRadius: '12px', backdropFilter: 'blur(4px)' }}>
                      {msg.dateStr}
                    </div>
                  </div>
                )}
                <div style={{ alignSelf: msg.isMine ? 'flex-end' : 'flex-start', display: 'flex', flexDirection: msg.isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '6px', maxWidth: '80%', marginTop: isGrouped ? '2px' : '12px' }}>
                  {(!msg.text && msg.imageUrl) ? (
                    <div>
                      <img src={msg.imageUrl} alt="stamp" onClick={() => !msg.imageUrl?.includes('/stamps/') && setPreviewImage(msg.imageUrl!)} style={{ width: '160px', height: '160px', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))', cursor: msg.imageUrl?.includes('/stamps/') ? 'default' : 'pointer' }} />
                    </div>
                  ) : (
                    <div style={{
                      background: msg.isMine ? 'var(--primary)' : 'rgba(255, 255, 255, 0.95)', padding: '10px 14px', borderRadius: '18px',
                      borderTopRightRadius: (msg.isMine && isGrouped) ? '4px' : '18px',
                      borderTopLeftRadius: (!msg.isMine && isGrouped) ? '4px' : '18px',
                      borderBottomRightRadius: (msg.isMine && !isNextGrouped) ? '4px' : '18px',
                      borderBottomLeftRadius: (!msg.isMine && !isNextGrouped) ? '4px' : '18px',
                      color: 'var(--text-main)', boxShadow: '0 4px 12px rgba(100, 116, 166, 0.08)', width: 'fit-content'
                    }}>
                      {msg.text && renderTextWithLinks(msg.text)}
                      {msg.imageUrl && <img src={msg.imageUrl} alt="attached" onClick={() => setPreviewImage(msg.imageUrl!)} style={{ width: '200px', height: '200px', objectFit: 'cover', marginTop: msg.text ? '8px' : '0', borderRadius: '12px', cursor: 'pointer' }} />}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isMine ? 'flex-end' : 'flex-start', justifyContent: 'flex-end', paddingBottom: '2px', opacity: msg.status === 'sending' ? 0.5 : 1 }}>
                    {msg.isMine && msg.is_read && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: '1', marginBottom: '2px' }}>既読</span>}
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems:'center', gap: '2px', lineHeight: '1' }}>
                      {msg.status === 'sending' ? '↗' : msg.time}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
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
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={() => { /* default behavior: enter adds newline */ }}
              placeholder="メッセージを入力してください..."
              rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', fontSize: '1rem', padding: '8px 0', resize: 'none', maxHeight: '120px' }}
            />
            <button onClick={() => handleSend()} style={{ background: inputText ? 'var(--primary)' : '#e2e8f0', color: inputText ? 'var(--text-main)' : 'var(--text-muted)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: inputText ? 'pointer' : 'default', transition: 'all 0.2s' }}>
              <Send size={18} style={{ transform: 'translate(1px, 1px)' }} />
            </button>
          </div>
        </div>
      </div>
      {previewImage && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(5px)'}} onClick={() => setPreviewImage(null)}>
          <button style={{position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:'50%', padding:8, cursor:'pointer'}}><X size={32}/></button>
          <img src={previewImage} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {isStampModalOpen && <StampCreatorModal onClose={() => setIsStampModalOpen(false)} onSave={handleStampSave} />}
    </>
  );
}
