"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase/client';
import { ChevronLeft, Plus, Edit3, Trash2 } from 'lucide-react';

type Memo = { id: number; title: string; content: string; updated_at: string };

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activeMemo, setActiveMemo] = useState<Memo | null>(null);
  const [isDBReady, setIsDBReady] = useState(false);
  const titleRef = useRef('');
  const contentRef = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerPushNotification = async (title: string, text: string) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: text })
      });
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    // 初回ロード
    const fetchMemos = async () => {
      try {
        const { data, error } = await supabase.from('memos').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        if (data) {
          setIsDBReady(true);
          setMemos(data as Memo[]);
        }
      } catch (e) {
        setIsDBReady(false);
      }
    };
    fetchMemos();

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // リアルタイム同期
      const channel = supabase.channel('public:memos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setMemos(prev => [payload.new as Memo, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Memo;
            setMemos(prev => prev.map(m => m.id === updated.id ? updated : m));
            // アクティブなメモが更新された場合（自分が編集していない時）の反映
            setActiveMemo(curr => {
              if (curr && curr.id === updated.id) {
                 if (titleRef.current !== updated.title || contentRef.current !== updated.content) {
                   return updated;
                 }
              }
              return curr;
            });
          } else if (payload.eventType === 'DELETE') {
            setMemos(prev => prev.filter(m => m.id !== payload.old.id));
            setActiveMemo(curr => (curr && curr.id === payload.old.id) ? null : curr);
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, []);

  const createMemo = async () => {
    if (!isDBReady) return;
    const newMemoInfo = { title: '新しいテーマのメモ', content: '', updated_at: new Date().toISOString() };
    const { data } = await supabase.from('memos').insert([newMemoInfo]).select().single();
    if (data) {
      setActiveMemo(data as Memo);
      titleRef.current = data.title;
      contentRef.current = data.content;
      triggerPushNotification("新しいメモ追加", "チーム全員に共有される新しいメモが追加されました！");
    }
  };

  const deleteMemo = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("このメモを削除しますか？全員から消去されます。")) {
      await supabase.from('memos').delete().eq('id', id);
    }
  };

  const handleUpdate = (id: number, field: 'title' | 'content', value: string) => {
    if (field === 'title') titleRef.current = value;
    if (field === 'content') contentRef.current = value;

    setActiveMemo(prev => prev ? { ...prev, [field]: value, updated_at: new Date().toISOString() } : null);

    // デバウンス自動保存
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      supabase.from('memos').update({
        [field]: value,
        updated_at: new Date().toISOString()
      }).eq('id', id).then();
    }, 1000);
  };

  if (activeMemo) {
    // ----------------------------------------
    // 詳細（エディタ）表示モード
    // ----------------------------------------
    return (
      <div className="chat-area glass-panel animate-slide-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setActiveMemo(null)} style={{ display: 'flex', alignItems: 'center', color: 'var(--primary)', fontWeight: 600 }}>
            <ChevronLeft size={20} /> もどる
          </button>
          <input 
            type="text" 
            value={activeMemo.title} 
            onChange={(e) => handleUpdate(activeMemo.id, 'title', e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 600, outline: 'none' }}
            placeholder="テーマ名・タイトル"
          />
        </div>
        <div style={{ flex: 1, padding: 0, display: 'flex' }}>
          <textarea
            value={activeMemo.content}
            onChange={(e) => handleUpdate(activeMemo.id, 'content', e.target.value)}
            style={{
              flex: 1, height: '100%', width: '100%', background: 'transparent',
              border: 'none', color: 'var(--text-main)', padding: '24px',
              fontSize: '1.05rem', lineHeight: '1.6', outline: 'none', resize: 'none'
            }}
            placeholder="ここにチーム全体で共有したい内容を入力してください... (自動保存されます)"
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------
  // リスト（一覧）表示モード
  // ----------------------------------------
  return (
    <div className="chat-area glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.4rem' }}>テーマ別メモ</h3>
          {!isDBReady && <span style={{fontSize: '0.75rem', color:'#fca5a5'}}>※DB未接続</span>}
        </div>
        <button className="btn-primary" onClick={createMemo} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
          <Plus size={18} /> 新規メモ
        </button>
      </div>
      
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {memos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>メモがありません。右上のボタンから作成してください。</div>
        ) : (
          memos.map(memo => (
            <div 
              key={memo.id} 
              className="animate-slide-up"
              onClick={() => {
                setActiveMemo(memo);
                titleRef.current = memo.title;
                contentRef.current = memo.content;
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '20px', 
                cursor: 'pointer', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: 'var(--text-main)' }}>{memo.title || '名称未設定'}</h4>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {memo.content || 'まだ内容がありません...'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  最終更新: {new Date(memo.updated_at).toLocaleString('ja-JP')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                 <button className="btn-glass" style={{ padding: '10px' }}>
                   <Edit3 size={18} />
                 </button>
                 <button className="btn-glass" onClick={(e) => deleteMemo(e, memo.id)} style={{ padding: '10px', color: '#fca5a5' }}>
                   <Trash2 size={18} />
                 </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
