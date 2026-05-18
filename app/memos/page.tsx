"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../utils/supabase/client';
import { ChevronLeft, Plus, Trash2, GripVertical, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Memo = { id: number; title: string; content: string; updated_at: string; position: number | null };

// --- URL リンク化ヘルパー ---
const URL_REGEX = /(https?:\/\/[^\s<>"'）」、。]+)/g;

function renderContentWithLinks(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: '#6d49c8', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// --- 並び替え可能なメモアイテム ---
function SortableMemoItem({
  memo,
  isReordering,
  onOpen,
  onDelete,
  onLongPress,
}: {
  memo: Memo;
  isReordering: boolean;
  onOpen: (memo: Memo) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
  onLongPress: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: memo.id,
    disabled: !isReordering,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'rgba(255,255,255,0.85)',
    borderRadius: '14px',
    padding: '16px',
    cursor: isReordering ? 'grab' : 'pointer',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    opacity: isDragging ? 0.85 : 1,
    touchAction: isReordering ? 'none' : 'auto',
  };

  // 長押し検知用 (非並び替え時のみ)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  const handlePointerDown = () => {
    if (isReordering) return;
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // 振動 (対応端末のみ)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(30); } catch {}
      }
      onLongPress();
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerMove = () => {
    // 指が動いたら長押しキャンセル
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (isReordering) return;
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    onOpen(memo);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      {...(isReordering ? { ...attributes, ...listeners } : {})}
    >
      {isReordering && (
        <div style={{ marginRight: '10px', color: '#9370db', display: 'flex', alignItems: 'center' }}>
          <GripVertical size={18} />
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: 'var(--text-main)' }}>{memo.title || '名称未設定'}</h4>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {memo.content || 'まだ内容がありません'}
        </div>
        <div style={{ fontSize: '0.65rem', color: '#cbd5e1', marginTop: '4px' }}>
          {new Date(memo.updated_at).toLocaleString('ja-JP')}
        </div>
      </div>
      {!isReordering && (
        <button onClick={e => onDelete(e, memo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: '8px', flexShrink: 0 }}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activeMemoId, setActiveMemoId] = useState<number | null>(null);
  const [isDBReady, setIsDBReady] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [isContentEditing, setIsContentEditing] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editingIdRef = useRef<number | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortMemos = useCallback((list: Memo[]) => {
    // position 昇順、null は末尾
    return [...list].sort((a, b) => {
      const ap = a.position ?? Number.POSITIVE_INFINITY;
      const bp = b.position ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, []);

  useEffect(() => {
    const fetchMemos = async () => {
      try {
        const { data, error } = await supabase.from('memos').select('*').order('position', { ascending: true, nullsFirst: false });
        if (error) throw error;
        if (data) { setIsDBReady(true); setMemos(sortMemos(data as Memo[])); }
      } catch { setIsDBReady(false); }
    };
    fetchMemos();

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const channel = supabase.channel('public:memos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setMemos(prev => {
              if (prev.find(m => m.id === (payload.new as Memo).id)) return prev;
              return sortMemos([payload.new as Memo, ...prev]);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Memo;
            // 自分が編集中のメモのstateは絶対に触らない
            if (editingIdRef.current === updated.id) return;
            setMemos(prev => sortMemos(prev.map(m => m.id === updated.id ? updated : m)));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setMemos(prev => prev.filter(m => m.id !== deletedId));
            if (editingIdRef.current === deletedId) {
              editingIdRef.current = null;
              setActiveMemoId(null);
            }
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [sortMemos]);

  const scheduleSave = (title: string, content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const id = editingIdRef.current;
      if (!id) return;
      supabase.from('memos').update({ title, content, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => { if (error) console.error('Auto-save failed:', error); });
    }, 1000);
  };

  const openMemo = (memo: Memo) => {
    editingIdRef.current = memo.id;
    setActiveMemoId(memo.id);
    setEditTitle(memo.title);
    setEditContent(memo.content);
    setIsContentEditing(false);
  };

  const closeMemo = () => {
    // flush pending save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = editingIdRef.current;
    if (id) {
      supabase.from('memos').update({ title: editTitle, content: editContent, updated_at: new Date().toISOString() }).eq('id', id).then();
    }
    editingIdRef.current = null;
    setActiveMemoId(null);
    setIsContentEditing(false);
    // refetch list
    supabase.from('memos').select('*').order('position', { ascending: true, nullsFirst: false }).then(({ data }) => {
      if (data) setMemos(sortMemos(data as Memo[]));
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEditTitle(val);
    scheduleSave(val, editContent);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditContent(val);
    scheduleSave(editTitle, val);
  };

  const enterContentEdit = () => {
    setIsContentEditing(true);
    // 次フレームで focus
    setTimeout(() => contentTextareaRef.current?.focus(), 0);
  };

  const createMemo = async () => {
    if (!isDBReady) return;
    // 先頭に挿入したいので、現在の最小 position より小さい値を採用
    const minPos = memos.reduce((acc, m) => {
      if (m.position == null) return acc;
      return Math.min(acc, m.position);
    }, Number.POSITIVE_INFINITY);
    const newPos = Number.isFinite(minPos) ? minPos - 1000 : 1000;
    const { data } = await supabase.from('memos').insert([{ title: '新しいメモ', content: '', updated_at: new Date().toISOString(), position: newPos }]).select().single();
    if (data) openMemo(data as Memo);
  };

  const deleteMemo = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("このメモを削除しますか？")) {
      await supabase.from('memos').delete().eq('id', id);
    }
  };

  // 並び替え終了時 (drag end)
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = memos.findIndex(m => m.id === active.id);
    const newIndex = memos.findIndex(m => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(memos, oldIndex, newIndex);

    // 1000 刻みで position を振り直し
    const updates = reordered.map((m, i) => ({ id: m.id, position: (i + 1) * 1000 }));
    setMemos(reordered.map((m, i) => ({ ...m, position: (i + 1) * 1000 })));

    // DB へ並列 update
    await Promise.all(updates.map(u =>
      supabase.from('memos').update({ position: u.position }).eq('id', u.id)
    ));
  };

  const isEditing = activeMemoId !== null;

  return (
    <div className="chat-area glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* === エディタ画面（上に重ねる） === */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: isEditing ? 10 : -1,
        opacity: isEditing ? 1 : 0, pointerEvents: isEditing ? 'auto' : 'none',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)',
        transition: 'opacity 0.15s'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--glass-bg)' }}>
          <button onClick={closeMemo} style={{ display: 'flex', alignItems: 'center', color: '#9370db', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronLeft size={20} /> もどる
          </button>
          <input
            type="text"
            value={editTitle}
            onChange={handleTitleChange}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.15rem', fontWeight: 600, outline: 'none' }}
            placeholder="タイトル"
          />
        </div>
        {isContentEditing ? (
          <textarea
            ref={contentTextareaRef}
            value={editContent}
            onChange={handleContentChange}
            onBlur={() => setIsContentEditing(false)}
            style={{
              flex: 1, width: '100%', background: 'transparent',
              border: 'none', color: 'var(--text-main)', padding: '20px 24px',
              fontSize: '1rem', lineHeight: '1.6', outline: 'none', resize: 'none'
            }}
            placeholder="ここに内容を入力... (自動保存)"
          />
        ) : (
          <div
            onClick={enterContentEdit}
            style={{
              flex: 1, width: '100%', background: 'transparent',
              color: 'var(--text-main)', padding: '20px 24px',
              fontSize: '1rem', lineHeight: '1.6', overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              cursor: 'text', minHeight: 0,
            }}
          >
            {editContent
              ? renderContentWithLinks(editContent)
              : <span style={{ color: '#94a3b8' }}>タップして内容を入力...</span>}
          </div>
        )}
      </div>

      {/* === 一覧画面 === */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>メモ</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isReordering ? (
            <button
              onClick={() => setIsReordering(false)}
              style={{ background: '#10b981', color: 'white', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: 'none', cursor: 'pointer' }}
            >
              <Check size={16} /> 完了
            </button>
          ) : (
            <button onClick={createMemo} style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> 新規メモ
            </button>
          )}
        </div>
      </div>
      {isReordering && (
        <div style={{ padding: '8px 16px', background: 'rgba(147,112,219,0.08)', fontSize: '0.75rem', color: '#6d49c8', textAlign: 'center' }}>
          ドラッグして並び替え、完了で確定
        </div>
      )}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {memos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>メモがありません</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={memos.map(m => m.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {memos.map(memo => (
                  <SortableMemoItem
                    key={memo.id}
                    memo={memo}
                    isReordering={isReordering}
                    onOpen={openMemo}
                    onDelete={deleteMemo}
                    onLongPress={() => setIsReordering(true)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
