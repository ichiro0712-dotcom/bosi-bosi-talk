"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../utils/supabase/client';
import { ChevronLeft, Plus, Trash2, GripVertical, Bot } from 'lucide-react';
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

type Memo = { id: number; title: string; content: string; updated_at: string; position: number | null; is_mochi_tool: boolean };

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
  onOpen,
  onDelete,
}: {
  memo: Memo;
  onOpen: (memo: Memo) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: memo.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'rgba(255,255,255,0.85)',
    borderRadius: '14px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
    display: 'flex',
    alignItems: 'stretch',
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* ドラッグハンドル (常時左側に表示) */}
      <div
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="並び替え"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 4px 0 8px',
          color: '#cbd5e1',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          flexShrink: 0,
        }}
      >
        <GripVertical size={18} />
      </div>

      {/* メイン領域 (タップで開く) */}
      <div
        onClick={() => onOpen(memo)}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 16px 4px',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {memo.is_mochi_tool && (
              <span title="もちが使うメモ" style={{ display: 'inline-flex', color: '#9370db', flexShrink: 0 }}>
                <Bot size={14} />
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memo.title || '名称未設定'}</span>
          </h4>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {memo.content || 'まだ内容がありません'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#cbd5e1', marginTop: '4px' }}>
            {new Date(memo.updated_at).toLocaleString('ja-JP')}
          </div>
        </div>
        <button onClick={e => onDelete(e, memo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: '8px', flexShrink: 0 }}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activeMemoId, setActiveMemoId] = useState<number | null>(null);
  const [isDBReady, setIsDBReady] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsMochiTool, setEditIsMochiTool] = useState(false);
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
    setEditIsMochiTool(!!memo.is_mochi_tool);
    setIsContentEditing(false);
  };

  const toggleMochiTool = async () => {
    const id = editingIdRef.current;
    if (!id) return;
    const newVal = !editIsMochiTool;
    setEditIsMochiTool(newVal);
    setMemos(prev => prev.map(m => m.id === id ? { ...m, is_mochi_tool: newVal } : m));
    await supabase.from('memos').update({ is_mochi_tool: newVal }).eq('id', id);
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
          <button
            onClick={toggleMochiTool}
            title={editIsMochiTool ? 'もちが使うメモにする (ON)' : 'もちが使うメモにする (OFF)'}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '8px',
              background: editIsMochiTool ? '#9370db' : 'transparent',
              color: editIsMochiTool ? 'white' : '#9370db',
              border: editIsMochiTool ? 'none' : '1px solid #c4b5fd',
              cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <Bot size={14} /> もち用
          </button>
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
        <button onClick={createMemo} style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> 新規メモ
        </button>
      </div>
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
                    onOpen={openMemo}
                    onDelete={deleteMemo}
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
