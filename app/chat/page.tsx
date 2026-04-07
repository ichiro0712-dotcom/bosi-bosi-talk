"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Image as ImageIcon, Smile, FilePlus, X, BellRing, Reply, Megaphone, Copy, Trash2, RotateCcw, ChevronDown, AlertCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import dynamic from 'next/dynamic';

const StampCreatorModal = dynamic(() => import('../components/StampCreatorModal'), { ssr: false });

type Message = {
  id: number | string; text: string; isMine: boolean; time: string;
  timestamp?: number; dateStr?: string; imageUrl?: string;
  is_read?: boolean; status?: 'sending' | 'sent' | 'error'; user_id?: string;
  target_user?: string; reply_to?: number | null; is_deleted?: boolean;
  deleted_at?: string | null; reply_text?: string; reply_user?: string;
  created_at_raw?: string;
};

type Announcement = { id: number; message_id: number; text: string; user_id: string; created_by: string };

function renderTextWithLinks(text: string) {
  const splitRegex = /(https?:\/\/[^\s]+)/g;
  const testRegex = /^https?:\/\//;
  const parts = text.split(splitRegex);
  return (
    <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4', fontWeight: 500, letterSpacing: '0.02em' }}>
      {parts.map((part, i) => testRegex.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{color:'inherit', textDecoration:'underline'}}>{part}</a> : part)}
    </div>
  );
}

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

const SPEAKER = (uid: string | undefined) => uid === 'user_a' ? 'ミルク' : uid === 'user_b' ? 'メリー' : 'もち';

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
  const [pushStatus, setPushStatus] = useState<string>('granted');
  const [isMochiMode, setIsMochiMode] = useState(false);
  const [isMochiTyping, setIsMochiTyping] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnList, setShowAnnList] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [localDeleted, setLocalDeleted] = useState<Set<number | string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const msgRefs = useRef<Map<number | string, HTMLDivElement>>(new Map());

  // ローカル削除をlocalStorageから復元
  useEffect(() => {
    const saved = localStorage.getItem('boshi_local_deleted');
    if (saved) { try { setLocalDeleted(new Set(JSON.parse(saved))); } catch {} }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, previewImage]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setPushStatus(Notification.permission);
  }, []);

  useEffect(() => {
    if (pushStatus === 'granted' && myProfile && 'serviceWorker' in navigator && 'PushManager' in window && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        try {
          const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string) });
          const subJSON = subscription.toJSON();
          if (subJSON.endpoint && subJSON.keys) {
            await supabase.from('subscriptions').upsert({ endpoint: subJSON.endpoint, p256dh: subJSON.keys.p256dh, auth: subJSON.keys.auth, user_id: myProfile }, { onConflict: 'endpoint' });
          }
        } catch (e) { console.warn('Push sub failed', e); }
      });
    }
  }, [pushStatus, myProfile]);

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
    if (saved) setMyProfile(saved); else window.location.href = '/';
    setIsProfileChecking(false);
  }, []);

  const formatMsg = useCallback((m: any, myP: string): Message => ({
    id: m.id, text: m.is_deleted ? '' : m.text, isMine: m.user_id === myP,
    time: new Date(m.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date(m.created_at).getTime(),
    dateStr: new Date(m.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
    imageUrl: m.is_deleted ? undefined : m.image_url, is_read: m.is_read, status: 'sent',
    user_id: m.user_id, target_user: m.target_user, reply_to: m.reply_to,
    is_deleted: m.is_deleted, deleted_at: m.deleted_at, created_at_raw: m.created_at,
  }), []);

  // メッセージ取得 & リアルタイム
  useEffect(() => {
    if (!myProfile) return;

    const initDB = async () => {
      try {
        const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50);
        if (data) {
          setIsDBReady(true);
          const sorted = data.reverse();
          const formatted = sorted.map(m => formatMsg(m, myProfile));

          // リプライ先を解決
          const replyIds = formatted.filter(m => m.reply_to).map(m => m.reply_to!);
          if (replyIds.length > 0) {
            const { data: replyMsgs } = await supabase.from('messages').select('id, text, user_id, is_deleted').in('id', replyIds);
            if (replyMsgs) {
              const replyMap = new Map(replyMsgs.map(r => [r.id, r]));
              formatted.forEach(m => {
                if (m.reply_to && replyMap.has(m.reply_to)) {
                  const r = replyMap.get(m.reply_to)!;
                  m.reply_text = r.is_deleted ? 'メッセージの送信を取り消しました' : r.text;
                  m.reply_user = SPEAKER(r.user_id);
                }
              });
            }
          }
          setMessages(formatted);

          // 既読処理（画面がアクティブな時のみ）
          if (document.visibilityState === 'visible') {
            const unread = sorted.filter(m => m.user_id !== myProfile && !m.is_read).map(m => m.id);
            if (unread.length > 0) supabase.from('messages').update({ is_read: true }).in('id', unread).then();
          }
        }
      } catch { setIsDBReady(false); }
    };
    initDB();

    // アナウンス取得
    const fetchAnn = async () => {
      const { data } = await supabase.from('announcements').select('id, message_id, created_by').order('created_at', { ascending: false }).limit(5);
      if (data && data.length > 0) {
        const msgIds = data.map(a => a.message_id);
        const { data: msgs } = await supabase.from('messages').select('id, text, user_id').in('id', msgIds);
        if (msgs) {
          const msgMap = new Map(msgs.map(m => [m.id, m]));
          setAnnouncements(data.map(a => {
            const m = msgMap.get(a.message_id);
            return { ...a, text: m?.text || '', user_id: m?.user_id || '' };
          }).filter(a => a.text));
        }
      }
    };
    fetchAnn();

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const channel = supabase.channel('chat-messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as any;
            const msg = formatMsg(newMsg, myProfile);
            setMessages(prev => {
              if (prev.find(p => p.id === newMsg.id)) return prev;
              // tempメッセージ置換: 同じ送信者 + テキスト一致 or 画像送信（テキスト空）
              const withoutTemp = prev.filter(m => {
                if (!m.id.toString().startsWith('temp_')) return true;
                if (m.user_id !== newMsg.user_id) return true;
                // テキスト一致 or 両方画像（テキスト空同士）
                if (m.text === newMsg.text) return false;
                if (!m.text && !newMsg.text && m.imageUrl && newMsg.image_url) return false;
                return true;
              });
              return [...withoutTemp, msg];
            });
            // 画面がアクティブな時のみ既読にする
            if (newMsg.user_id !== myProfile && !newMsg.is_read && document.visibilityState === 'visible') {
              setTimeout(() => supabase.from('messages').update({ is_read: true }).eq('id', newMsg.id).then(), 300);
            }
          } else if (payload.eventType === 'UPDATE') {
            const u = payload.new as any;
            setMessages(prev => prev.map(m => {
              if (m.id === u.id) {
                return {
                  ...m, is_read: u.is_read, is_deleted: u.is_deleted,
                  text: u.is_deleted ? '' : (u.text || m.text),
                  imageUrl: u.is_deleted ? undefined : m.imageUrl,
                  deleted_at: u.deleted_at,
                };
              }
              return m;
            }));
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [myProfile, formatMsg]);

  // 画面が見えるようになったら: 未読を既読にする + メッセージをリフレッシュ
  useEffect(() => {
    if (!myProfile) return;
    const handleVisible = async () => {
      if (document.visibilityState === 'visible') {
        // メッセージをDBからリフレッシュ（Realtimeが途切れていた場合のフォールバック）
        const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(30);
        if (data) {
          const sorted = data.reverse();
          setMessages(prev => {
            let updated = [...prev.filter(m => m.id.toString().startsWith('temp_') || m.id.toString().startsWith('err_'))];
            for (const m of sorted) {
              const existing = prev.find(p => p.id === m.id);
              updated.push(existing ? { ...existing, is_read: m.is_read, is_deleted: m.is_deleted } : formatMsg(m, myProfile));
            }
            return updated;
          });
          // 未読を既読にする
          const unread = sorted.filter(m => m.user_id !== myProfile && !m.is_read).map(m => m.id);
          if (unread.length > 0) supabase.from('messages').update({ is_read: true }).in('id', unread).then();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [myProfile, formatMsg]);

  // ポーリングフォールバック: 15秒ごとに新着確認（Realtime障害対策）
  useEffect(() => {
    if (!myProfile) return;
    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(5);
      if (data) {
        const sorted = data.reverse();
        setMessages(prev => {
          let changed = false;
          const updated = [...prev];
          for (const m of sorted) {
            if (!updated.find(p => p.id === m.id)) {
              updated.push(formatMsg(m, myProfile));
              changed = true;
            }
            // 既読状態の更新
            const existing = updated.find(p => p.id === m.id);
            if (existing && existing.is_read !== m.is_read) {
              Object.assign(existing, { is_read: m.is_read });
              changed = true;
            }
          }
          return changed ? [...updated] : prev;
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [myProfile, formatMsg]);

  // ===== ジャンプ & ハイライト =====
  const jumpToMessage = (msgId: number) => {
    const el = msgRefs.current.get(msgId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(msgId);
      setTimeout(() => setHighlightId(null), 2000);
    }
  };

  // ===== Push =====
  const requestPushPermission = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert("プッシュ通知に対応していません"); return; }
    const perm = await Notification.requestPermission(); setPushStatus(perm);
    if (perm === 'granted' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string) });
        const subJSON = subscription.toJSON();
        if (subJSON.endpoint && subJSON.keys) await supabase.from('subscriptions').upsert({ endpoint: subJSON.endpoint, p256dh: subJSON.keys.p256dh, auth: subJSON.keys.auth, user_id: myProfile || 'unknown' }, { onConflict: 'endpoint' });
        alert("通知の許可が完了しました！");
      } catch { alert("通知の設定中にエラーが発生しました。"); }
    }
  };

  const triggerPush = async (text: string, imageUrl?: string) => {
    try { await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: "BOSHI×BOSHI Talk", body: text || "スタンプが送信されました！", imageUrl, senderUserId: myProfile }) }); } catch {}
  };

  // ===== 長押し =====
  const handleLongPressStart = (msg: Message, e: React.TouchEvent | React.MouseEvent) => {
    if (msg.is_deleted || msg.status === 'sending') return;
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => setContextMenu({ msg, x: cx, y: cy }), 500);
  };
  const handleLongPressEnd = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  // ===== メニューアクション =====

  // 送信取り消し（24時間以内、全員から消える、痕跡あり）
  const handleUnsend = async (msg: Message) => {
    setContextMenu(null);
    if (!msg.isMine) return;
    const sentAt = msg.created_at_raw ? new Date(msg.created_at_raw) : null;
    if (sentAt && (Date.now() - sentAt.getTime()) > 24 * 60 * 60 * 1000) {
      alert('送信から24時間が経過したため、取り消しできません。');
      return;
    }
    await supabase.from('messages').update({ is_deleted: true, text: '', image_url: null, deleted_at: new Date().toISOString() }).eq('id', msg.id);
  };

  // 削除（自分の端末からのみ。痕跡なし）
  const handleLocalDelete = (msg: Message) => {
    setContextMenu(null);
    const next = new Set(localDeleted);
    next.add(msg.id);
    setLocalDeleted(next);
    localStorage.setItem('boshi_local_deleted', JSON.stringify(Array.from(next)));
  };

  // リプライ
  const handleReply = (msg: Message) => {
    setContextMenu(null);
    setReplyTo(msg);
    textareaRef.current?.focus();
  };

  // アナウンス（最大5件）
  const handleAnnounce = async (msg: Message) => {
    setContextMenu(null);
    if (typeof msg.id !== 'number') return;
    if (!msg.text) { alert('テキストメッセージのみアナウンスできます'); return; }
    if (announcements.length >= 5) { alert('アナウンスは最大5件です。既存のものを解除してください。'); return; }
    if (announcements.find(a => a.message_id === msg.id)) return;
    const { data } = await supabase.from('announcements').insert([{ message_id: msg.id, created_by: myProfile }]).select().single();
    if (data) {
      setAnnouncements(prev => [{ ...data, text: msg.text, user_id: msg.user_id || '' }, ...prev]);
    }
  };

  const removeAnnouncement = async (annId: number) => {
    await supabase.from('announcements').delete().eq('id', annId);
    setAnnouncements(prev => prev.filter(a => a.id !== annId));
  };

  // コピー
  const handleCopy = (msg: Message) => { setContextMenu(null); if (msg.text) navigator.clipboard.writeText(msg.text); };

  // エラー再送
  const handleRetry = async (msg: Message) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    handleSend(msg.text, msg.imageUrl);
  };
  const handleDeleteFailed = (msg: Message) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  };

  // ===== 送信 =====
  const handleSend = async (textOverride?: string, imgUrl?: string) => {
    const txt = textOverride || inputText;
    if (!txt && !imgUrl) return;
    setInputText(""); if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const sendingToMochi = isMochiMode;
    const replyToId = replyTo?.id;
    setReplyTo(null);

    const tempId = 'temp_' + Date.now() + Math.random().toString(36).substring(7);
    setMessages(prev => [...prev, {
      id: tempId, text: txt, isMine: true, status: 'sending', time: '送信中',
      timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
      imageUrl: imgUrl, user_id: myProfile || undefined, target_user: sendingToMochi ? 'mochi' : undefined,
      reply_to: typeof replyToId === 'number' ? replyToId : undefined,
      reply_text: replyTo?.text, reply_user: replyTo ? SPEAKER(replyTo.user_id) : undefined,
    }]);

    if (!sendingToMochi) triggerPush(txt, imgUrl);

    if (isDBReady && myProfile) {
      const insertData: any = { text: txt, image_url: imgUrl, user_id: myProfile, target_user: sendingToMochi ? 'mochi' : null };
      if (typeof replyToId === 'number') insertData.reply_to = replyToId;

      const { error } = await supabase.from('messages').insert([insertData]);
      if (error) {
        console.error("Send error", error);
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' as const } : m));
      } else {
        // 送信成功: Realtimeで置換されなかった場合のフォールバック（3秒後にtempを送信済みに）
        setTimeout(() => {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' as const, time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) } : m));
        }, 3000);
      }
      if (!error && sendingToMochi && txt && !imgUrl) {
        const userName = myProfile === 'user_a' ? 'ミルク' : 'メリー';
        setIsMochiTyping(true);
        fetch('/api/mochi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt, userId: myProfile, userName, currentScreen: 'chat' }) })
        .then(async res => {
          if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error || `HTTP ${res.status}`); }
          // もちの返答がRealtimeで届かない場合のフォールバック: 2秒後にDBからリフレッシュ
          setTimeout(async () => {
            const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10);
            if (data) {
              const sorted = data.reverse();
              setMessages(prev => {
                let updated = [...prev];
                for (const m of sorted) {
                  if (!updated.find(p => p.id === m.id)) {
                    updated.push(formatMsg(m, myProfile!));
                  }
                }
                return updated;
              });
            }
          }, 2000);
        })
        .catch(err => setMessages(prev => [...prev, { id: 'err_' + Date.now(), text: `（もちが応答できませんでした… ${err.message} 🍡）`, isMine: false, user_id: 'mochi', time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }) }]))
        .finally(() => setIsMochiTyping(false));
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAttachMenu(false); const file = e.target.files?.[0]; if (!file || !isDBReady) return;
    const tempId = 'temp_' + Date.now(); const tempUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, { id: tempId, text: '', isMine: true, status: 'sending', time: '送信中', timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }), imageUrl: tempUrl }]);
    const filePath = `uploads/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('chat_media').upload(filePath, file);
    if (!error) { const { data } = supabase.storage.from('chat_media').getPublicUrl(filePath); await supabase.from('messages').insert([{ text: "", image_url: data.publicUrl, user_id: myProfile! }]); triggerPush("画像が送信されました", data.publicUrl); }
    else { setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' as const } : m)); }
  };

  const handleStampSave = async (base64Image: string) => {
    if (!isDBReady || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    try { const res = await fetch(base64Image); const blob = await res.blob(); const fp = `stamps/${Date.now()}.png`;
      const { error } = await supabase.storage.from('chat_media').upload(fp, blob, { contentType: 'image/png' });
      if (!error) { const { data } = supabase.storage.from('chat_media').getPublicUrl(fp); await supabase.from('messages').insert([{ text: "オリジナルスタンプ！", image_url: data.publicUrl, user_id: myProfile! }]); triggerPush("オリジナルスタンプ！", data.publicUrl); }
    } catch (err) { console.error(err); }
  };

  const sendStamp = (filename: string) => {
    setShowStampPicker(false); const url = `/stamps/${filename}`; const tid = 'temp_' + Date.now();
    setMessages(prev => [...prev, { id: tid, text: '', isMine: true, status: 'sending', time: '送信中', timestamp: Date.now(), dateStr: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }), imageUrl: url }]);
    triggerPush("スタンプ！", url);
    if (isDBReady && myProfile) supabase.from('messages').insert([{ text: "", image_url: url, user_id: myProfile }]).then();
  };

  if (isProfileChecking || !myProfile) return <div style={{height: '100dvh', background: 'var(--bg-gradient)'}} />;

  // フィルタ: ローカル削除されたメッセージを除外
  const visibleMessages = messages.filter(m => !localDeleted.has(m.id));
  const latestAnn = announcements[0];

  return (
    <>
      <div className="chat-area glass-panel" onClick={() => { setContextMenu(null); setShowAnnList(false); }}>
        {!isDBReady && <div style={{ padding: '8px 24px', background: 'rgba(244,63,94,0.1)', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}><span style={{fontSize:'0.8rem', color:'#f43f5e', fontWeight:600}}>※DB未接続</span></div>}

        {pushStatus === 'denied' && <div style={{ padding: '8px 24px', background: 'rgba(244,63,94,0.1)', borderBottom: '1px solid var(--glass-border)', textAlign: 'center' }}><span style={{fontSize: '0.8rem', color:'#f43f5e', fontWeight: 600}}>通知がブロックされています</span></div>}
        {pushStatus === 'default' && (
          <div style={{ padding: '10px 16px', background: 'rgba(147,112,219,0.08)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{display:'flex', alignItems:'center', gap:'6px', color:'#9370db'}}><BellRing size={14} /><span style={{fontSize:'0.78rem', fontWeight:600}}>通知を受け取りますか？</span></div>
            <button onClick={requestPushPermission} style={{ background:'#9370db', color:'white', padding:'5px 14px', borderRadius:'10px', fontSize:'0.72rem', fontWeight:700 }}>許可する</button>
          </div>
        )}

        {/* アナウンスバー（LINE仕様: 最新1件表示 + 展開ボタン） */}
        {latestAnn && (
          <div style={{ position: 'relative' }}>
            <div style={{ padding: '8px 14px', background: 'rgba(147,112,219,0.06)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); jumpToMessage(latestAnn.message_id); }}>
              <Megaphone size={14} color="#9370db" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.7rem', color: '#9370db', fontWeight: 600, flexShrink: 0 }}>{SPEAKER(latestAnn.user_id)}</span>
              <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestAnn.text}</span>
              {announcements.length > 1 && (
                <button onClick={e => { e.stopPropagation(); setShowAnnList(!showAnnList); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                  <ChevronDown size={16} style={{ transform: showAnnList ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                </button>
              )}
            </div>
            {/* 展開リスト */}
            {showAnnList && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--glass-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                {announcements.map(a => (
                  <div key={a.id} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => { jumpToMessage(a.message_id); setShowAnnList(false); }}>
                    <Megaphone size={12} color="#9370db" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.7rem', color: '#9370db', fontWeight: 600, flexShrink: 0 }}>{SPEAKER(a.user_id)}</span>
                    <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                    <button onClick={e => { e.stopPropagation(); removeAnnouncement(a.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* メッセージ一覧 */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {visibleMessages.map((msg, index) => {
            const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
            const nextMsg = index < visibleMessages.length - 1 ? visibleMessages[index + 1] : null;
            const showDate = !prevMsg || prevMsg.dateStr !== msg.dateStr;
            // クラスタリング: 同じ人が連続 + 60秒以内 + 日付またぎなし + 間に別人なし
            const isGrouped = prevMsg && prevMsg.user_id === msg.user_id && ((msg.timestamp || 0) - (prevMsg.timestamp || 0) < 60000) && !showDate;
            const isNextGrouped = nextMsg && nextMsg.user_id === msg.user_id && ((nextMsg.timestamp || 0) - (msg.timestamp || 0) < 60000) && nextMsg.dateStr === msg.dateStr;
            const isHighlighted = highlightId === msg.id;
            const isFirst = !isGrouped; // クラスタの先頭
            const avatarSrc = msg.user_id === 'user_a' ? '/stamps/stamp_custom_7.png' : msg.user_id === 'user_b' ? '/stamps/stamp_custom_8.png' : '/mochi.png';
            const bubbleBg = (msg.user_id === 'mochi' || msg.target_user === 'mochi') ? '#e2e8f0' : msg.isMine ? '#f0c8f7' : 'rgba(255,255,255,0.95)';

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 16px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.1)', color: '#fff', fontSize: '0.7rem', fontWeight: 600, padding: '4px 12px', borderRadius: '12px', backdropFilter: 'blur(4px)' }}>{msg.dateStr}</div>
                  </div>
                )}
                <div
                  ref={el => { if (el && typeof msg.id === 'number') msgRefs.current.set(msg.id, el); }}
                  onTouchStart={e => handleLongPressStart(msg, e)} onTouchEnd={handleLongPressEnd} onTouchMove={handleLongPressEnd}
                  onContextMenu={e => { e.preventDefault(); if (!msg.is_deleted && msg.status !== 'sending') setContextMenu({ msg, x: e.clientX, y: e.clientY }); }}
                  style={{
                    alignSelf: msg.isMine ? 'flex-end' : 'flex-start',
                    display: 'flex', flexDirection: msg.isMine ? 'row-reverse' : 'row',
                    alignItems: 'flex-start', gap: '6px', maxWidth: '78%',
                    marginTop: isGrouped ? '2px' : '12px', userSelect: 'text',
                    transition: 'background 0.3s', borderRadius: '12px', padding: '2px',
                    background: isHighlighted ? 'rgba(147,112,219,0.15)' : 'transparent',
                  }}
                >
                  {/* アバター: 先頭のみ表示、2通目以降はスペーサー */}
                  {isFirst && msg.user_id && ['user_a','user_b','mochi'].includes(msg.user_id) ? (
                    <img src={avatarSrc} alt="" style={{width:'34px', height:'34px', borderRadius:'50%', objectFit:'contain', padding:'3px', boxSizing:'border-box', background:'#fff', border:'1px solid var(--glass-border)', flexShrink: 0, marginTop: '2px'}} />
                  ) : (
                    <div style={{width:'34px', flexShrink: 0}} />
                  )}

                  {/* 吹き出し + ステータス列 */}
                  <div style={{ display: 'flex', flexDirection: msg.isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '4px', minWidth: 0 }}>
                    {/* 吹き出し本体 */}
                    {msg.is_deleted ? (
                      <div style={{ padding: '8px 14px', borderRadius: '16px', background: 'rgba(0,0,0,0.02)', border: '1px dashed #e2e8f0' }}>
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>メッセージの送信を取り消しました</span>
                      </div>
                    ) : (!msg.text && msg.imageUrl) ? (
                      <img src={msg.imageUrl} alt="stamp" onClick={() => !msg.imageUrl?.includes('/stamps/') && setPreviewImage(msg.imageUrl!)} style={{ width:'150px', height:'150px', objectFit:'contain', filter:'drop-shadow(0 4px 6px rgba(0,0,0,0.1))', cursor: msg.imageUrl?.includes('/stamps/') ? 'default' : 'pointer' }} />
                    ) : (
                      <div style={{
                        background: bubbleBg,
                        padding: '10px 14px',
                        borderRadius: '18px',
                        // しっぽ: 先頭メッセージのみ角を尖らせる
                        borderTopRightRadius: (msg.isMine && isFirst) ? '4px' : '18px',
                        borderTopLeftRadius: (!msg.isMine && isFirst) ? '4px' : '18px',
                        // 連続時は丸く
                        ...(isGrouped ? { borderTopRightRadius: msg.isMine ? '4px' : '18px', borderTopLeftRadius: msg.isMine ? '18px' : '4px' } : {}),
                        color: 'var(--text-main)', boxShadow: '0 2px 8px rgba(100,116,166,0.06)', width: 'fit-content', maxWidth: '100%'
                      }}>
                        {/* リプライプレビュー */}
                        {(msg.reply_text || msg.reply_to) && (
                          <div onClick={e => { e.stopPropagation(); if (typeof msg.reply_to === 'number') jumpToMessage(msg.reply_to); }}
                            style={{ borderLeft: '3px solid #9370db', paddingLeft: '8px', marginBottom: '6px', fontSize: '0.72rem', color: '#64748b', cursor: typeof msg.reply_to === 'number' ? 'pointer' : 'default' }}>
                            <div style={{ fontWeight: 700, marginBottom: '1px', color: '#9370db' }}>{msg.reply_user || ''}</div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{msg.reply_text || ''}</div>
                          </div>
                        )}
                        {msg.text && renderTextWithLinks(msg.text)}
                        {msg.imageUrl && <img src={msg.imageUrl} alt="" onClick={() => setPreviewImage(msg.imageUrl!)} style={{ width:'200px', height:'200px', objectFit:'cover', marginTop: msg.text ? '8px' : '0', borderRadius:'12px', cursor:'pointer' }} />}
                      </div>
                    )}

                    {/* ステータス列: 既読 + 時刻（吹き出しの反対側下部） */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isMine ? 'flex-end' : 'flex-start', justifyContent: 'flex-end', paddingBottom: '2px', flexShrink: 0 }}>
                      {msg.status === 'error' && msg.isMine && (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
                          <button onClick={() => handleRetry(msg)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0, display: 'flex' }} title="再送"><RotateCcw size={12} /></button>
                          <button onClick={() => handleDeleteFailed(msg)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }} title="削除"><Trash2 size={12} /></button>
                        </div>
                      )}
                      {msg.status === 'error' && <AlertCircle size={14} color="#dc2626" />}
                      {msg.isMine && !msg.is_deleted && msg.is_read && msg.status === 'sent' && <span style={{ fontSize: '0.55rem', color: '#94a3b8', lineHeight: '1', marginBottom: '1px', fontWeight: 600 }}>既読</span>}
                      <span style={{ fontSize: '0.58rem', color: msg.status === 'error' ? '#dc2626' : '#94a3b8', lineHeight: '1' }}>
                        {msg.status === 'sending' ? '↗' : msg.status === 'error' ? '!' : msg.time}
                      </span>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {isMochiTyping && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'flex-end', gap: '6px', maxWidth: '80%', marginTop: '12px' }}>
              <img src="/mochi.png" alt="" style={{width:'36px', height:'36px', borderRadius:'50%', objectFit:'contain', padding:'4px', background:'#fff', border:'1px solid var(--glass-border)', opacity:0.8}} />
              <div style={{ background:'#e2e8f0', padding:'10px 14px', borderRadius:'18px', borderBottomLeftRadius:'4px' }}>
                <div style={{ display:'flex', gap:'4px', alignItems:'center', height:'20px' }}>
                  {[0, 0.2, 0.4].map((d, i) => <div key={i} style={{ width:'6px', height:'6px', background:'#cbd5e1', borderRadius:'50%', animation: `bounce 1s infinite ${d}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 入力エリア */}
        <div style={{ position: 'relative', padding: '12px 16px', borderTop: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
          {showAttachMenu && (
            <div className="animate-slide-up" style={{ position:'absolute', bottom:'76px', left:'16px', background:'rgba(255,255,255,0.98)', backdropFilter:'blur(20px)', borderRadius:'20px', padding:'14px', boxShadow:'var(--shadow-soft)', display:'flex', gap:'18px', zIndex:50, border:'1px solid var(--glass-border)' }}>
              <input type="file" id="media-upload" accept="image/*,video/*" style={{display:'none'}} onChange={handleFileUpload} />
              {[
                { icon: <ImageIcon size={22} />, label: '画像', bg: '#e2e8f0', color: '#475569', onClick: () => document.getElementById('media-upload')?.click() },
                { icon: <Smile size={22} />, label: 'スタンプ', bg: '#fce7f3', color: '#db2777', onClick: () => { setShowAttachMenu(false); setShowStampPicker(true); } },
                { icon: <img src="/mochi.png" alt="" style={{width:'26px', height:'26px', objectFit:'contain'}} />, label: isMochiMode ? 'ON' : 'もち', bg: isMochiMode ? '#cbd5e1' : '#f1f5f9', color: '#333', onClick: () => { setShowAttachMenu(false); setIsMochiMode(p => !p); }, border: isMochiMode ? '2px solid #333' : 'none' },
                { icon: <FilePlus size={22} />, label: '作成', bg: '#dbeafe', color: '#2563eb', onClick: () => { setShowAttachMenu(false); setIsStampModalOpen(true); } },
              ].map((item, i) => (
                <div key={i} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', cursor:'pointer'}} onClick={item.onClick}>
                  <div style={{background:item.bg, borderRadius:'50%', width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', color:item.color, border: (item as any).border || 'none'}}>{item.icon}</div>
                  <span style={{fontSize:'0.7rem', fontWeight:600, color:'var(--text-muted)'}}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {showStampPicker && (
            <div className="animate-slide-up" style={{ position:'absolute', bottom:'76px', left:'16px', right:'16px', background:'rgba(255,255,255,0.98)', backdropFilter:'blur(20px)', borderRadius:'20px', padding:'14px', boxShadow:'var(--shadow-soft)', zIndex:51, border:'1px solid var(--glass-border)' }}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:'12px', alignItems:'center'}}><h4 style={{margin:0, color:'var(--text-main)', fontSize:'0.9rem'}}>スタンプ</h4><button onClick={() => setShowStampPicker(false)} style={{background:'none', border:'none', fontSize:'1.3rem', cursor:'pointer', color:'var(--text-muted)'}}>×</button></div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(60px, 1fr))', gap:'10px', overflowY:'auto', maxHeight:'300px'}}>
                {Array.from({length: 64}, (_, i) => `stamp_custom_${i + 1}.png`).map(fn => (
                  <div key={fn} onClick={() => sendStamp(fn)} style={{aspectRatio:'1/1', background:'#f8fafc', borderRadius:'10px', overflow:'hidden', cursor:'pointer', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <img src={`/stamps/${fn}`} alt="" style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain', padding:'3px'}} onError={(e) => { (e.target as HTMLElement).style.display='none'; }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* リプライプレビュー */}
          {replyTo && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'8px 12px', background:'#f8fafc', borderRadius:'10px', borderLeft:'3px solid #9370db' }}>
              <Reply size={14} color="#9370db" />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, color:'#9370db' }}>{SPEAKER(replyTo.user_id)}</div>
                <div style={{ fontSize:'0.73rem', color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{replyTo.text || '画像'}</div>
              </div>
              <button onClick={() => setReplyTo(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={16} /></button>
            </div>
          )}

          {isMochiMode && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', marginBottom:'8px', padding:'5px 10px', background:'#f1f5f9', borderRadius:'10px' }}>
              <img src="/mochi.png" alt="" style={{ width:'18px', height:'18px', objectFit:'contain' }} />
              <span style={{ fontSize:'0.72rem', fontWeight:600, color:'#64748b' }}>もちモード中</span>
              <button onClick={() => setIsMochiMode(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'0.9rem', padding:'0 4px', lineHeight:1 }}>✕</button>
            </div>
          )}

          <div style={{ display:'flex', background: isMochiMode ? '#f8fafc' : 'rgba(255,255,255,0.65)', border: isMochiMode ? '2px solid #cbd5e1' : '1px solid var(--glass-border)', borderRadius:'24px', padding:'6px 14px', alignItems:'center', gap:'10px' }}>
            <button onClick={() => {setShowAttachMenu(!showAttachMenu); setShowStampPicker(false);}} style={{ color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:'4px', display:'flex' }}>
              <Plus size={22} style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition:'all 0.2s' }} />
            </button>
            <textarea ref={textareaRef} value={inputText}
              onChange={e => { setInputText(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight, 120)+'px'; }}
              placeholder={isMochiMode ? "もちに話しかける..." : "メッセージを入力..."} rows={1}
              style={{ flex:1, background:'transparent', border:'none', color:'var(--text-main)', outline:'none', fontSize:'0.95rem', padding:'7px 0', resize:'none', maxHeight:'120px' }}
            />
            <button onClick={() => handleSend()} style={{ background: inputText ? (isMochiMode ? '#94a3b8' : '#9370db') : '#e2e8f0', color: inputText ? 'white' : 'var(--text-muted)', border:'none', borderRadius:'50%', width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor: inputText ? 'pointer' : 'default', flexShrink:0 }}>
              <Send size={17} style={{ transform:'translate(1px, 1px)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* 長押しコンテキストメニュー */}
      {contextMenu && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:200 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position:'fixed', left: Math.min(contextMenu.x, window.innerWidth - 170), top: Math.min(contextMenu.y - 10, window.innerHeight - 280),
            zIndex:201, background:'rgba(255,255,255,0.98)', backdropFilter:'blur(20px)', borderRadius:'14px', padding:'4px', minWidth:'155px',
            boxShadow:'0 8px 30px rgba(0,0,0,0.15)', border:'1px solid rgba(0,0,0,0.06)'
          }}>
            {[
              { icon: <Reply size={16} />, label: 'リプライ', onClick: () => handleReply(contextMenu.msg) },
              { icon: <Copy size={16} />, label: 'コピー', onClick: () => handleCopy(contextMenu.msg), show: !!contextMenu.msg.text },
              { icon: <Megaphone size={16} />, label: 'アナウンス', onClick: () => handleAnnounce(contextMenu.msg), show: !!contextMenu.msg.text && typeof contextMenu.msg.id === 'number' },
              { icon: <Trash2 size={16} />, label: '送信取り消し', onClick: () => handleUnsend(contextMenu.msg), show: contextMenu.msg.isMine, color: '#dc2626' },
              { icon: <X size={16} />, label: '削除', onClick: () => handleLocalDelete(contextMenu.msg), color: '#94a3b8' },
            ].filter(item => item.show !== false).map((item, i) => (
              <button key={i} onClick={item.onClick} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', color: item.color || 'var(--text-main)', width:'100%', textAlign:'left', borderRadius:'8px', fontSize:'0.83rem', fontWeight:500 }}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {previewImage && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(5px)'}} onClick={() => setPreviewImage(null)}>
          <button style={{position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:'50%', padding:8, cursor:'pointer'}}><X size={32}/></button>
          <img src={previewImage} style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}} onClick={e => e.stopPropagation()} />
        </div>
      )}
      {isStampModalOpen && <StampCreatorModal onClose={() => setIsStampModalOpen(false)} onSave={handleStampSave} />}
    </>
  );
}
