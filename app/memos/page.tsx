"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase/client';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';

type Memo = { id: number; title: string; content: string; updated_at: string };

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activeMemoId, setActiveMemoId] = useState<number | null>(null);
  const [isDBReady, setIsDBReady] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeMemoIdRef = useRef<number | null>(null);

  // activeMemoIdをrefにも同期（Realtimeコールバック内で参照するため）
  useEffect(() => { activeMemoIdRef.current = activeMemoId; }, [activeMemoId]);

  useEffect(() => {
    const fetchMemos = async () => {
      try {
        const { data, error } = await supabase.from('memos').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        if (data) { setIsDBReady(true); setMemos(data as Memo[]); }
      } catch { setIsDBReady(false); }
    };
    fetchMemos();

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const channel = supabase.channel('public:memos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setMemos(prev => [payload.new as Memo, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Memo;
            // 編集中のメモはstateを更新しない（カーソル飛び防止）
            if (activeMemoIdRef.current === updated.id) return;
            setMemos(prev => prev.map(m => m.id === updated.id ? updated : m));
          } else if (payload.eventType === 'DELETE') {
            setMemos(prev => prev.filter(m => m.id !== (payload.old as any).id));
            if (activeMemoIdRef.current === (payload.old as any).id) {
              setActiveMemoId(null);
            }
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, []);

  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const id = activeMemoIdRef.current;
      if (!id) return;
      const title = titleRef.current?.value ?? '';
      const content = contentRef.current?.value ?? '';
      supabase.from('memos').update({ title, content, updated_at: new Date().toISOString() }).eq('id', id).then();
    }, 1000);
  };

  const openMemo = (memo: Memo) => {
    setActiveMemoId(memo.id);
    // DOMのrefに直接値をセット（次フレームで）
    requestAnimationFrame(() => {
      if (titleRef.current) titleRef.current.value = memo.title;
      if (contentRef.current) contentRef.current.value = memo.content;
    });
  };

  const closeMemo = () => {
    // 未保存をflush
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const id = activeMemoIdRef.current;
      if (id) {
        const title = titleRef.current?.value ?? '';
        const content = contentRef.current?.value ?? '';
        supabase.from('memos').update({ title, content, updated_at: new Date().toISOString() }).eq('id', id).then();
      }
    }
    setActiveMemoId(null);
    // 一覧を最新に更新
    supabase.from('memos').select('*').order('updated_at', { ascending: false }).then(({ data }) => {
      if (data) setMemos(data as Memo[]);
    });
  };

  const createMemo = async () => {
    if (!isDBReady) return;
    const { data } = await supabase.from('memos').insert([{ title: '新しいメモ', content: '', updated_at: new Date().toISOString() }]).select().single();
    if (data) openMemo(data as Memo);
  };

  const deleteMemo = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("このメモを削除しますか？")) {
      await supabase.from('memos').delete().eq('id', id);
    }
  };

  return (
    <div className="chat-area glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* エディタ画面 */}
      {activeMemoId !== null && (
        <>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={closeMemo} style={{ display: 'flex', alignItems: 'center', color: '#9370db', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronLeft size={20} /> もどる
            </button>
            <input
              ref={titleRef}
              type="text"
              defaultValue=""
              onChange={scheduleSave}
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 600, outline: 'none' }}
              placeholder="タイトル"
            />
          </div>
          <div style={{ flex: 1, padding: 0, display: 'flex' }}>
            <textarea
              ref={contentRef}
              defaultValue=""
              onChange={scheduleSave}
              style={{
                flex: 1, height: '100%', width: '100%', background: 'transparent',
                border: 'none', color: 'var(--text-main)', padding: '24px',
                fontSize: '1.05rem', lineHeight: '1.6', outline: 'none', resize: 'none'
              }}
              placeholder="ここに内容を入力... (自動保存)"
            />
          </div>
        </>
      )}

      {/* 一覧画面 */}
      {activeMemoId === null && (
        <>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>メモ</h3>
            <button onClick={createMemo} style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> 新規メモ
            </button>
          </div>
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {memos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>メモがありません</div>
            ) : memos.map(memo => (
              <div key={memo.id} onClick={() => openMemo(memo)} style={{
                background: 'rgba(255,255,255,0.85)', borderRadius: '14px', padding: '16px',
                cursor: 'pointer', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: 'var(--text-main)' }}>{memo.title || '名称未設定'}</h4>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {memo.content || 'まだ内容がありません'}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#cbd5e1', marginTop: '4px' }}>
                    {new Date(memo.updated_at).toLocaleString('ja-JP')}
                  </div>
                </div>
                <button onClick={e => deleteMemo(e, memo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: '8px', flexShrink: 0 }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
