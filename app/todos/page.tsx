"use client";

import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Check, X } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

type Todo = {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  assignee: string;
  due_date: string | null;
  status: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'まだ', color: '#94a3b8', bg: '#f1f5f9' },
  on_track:    { label: '順調', color: '#16a34a', bg: '#dcfce7' },
  trouble:     { label: 'トラブル', color: '#ea580c', bg: '#fff7ed' },
  delayed:     { label: '遅れてる', color: '#dc2626', bg: '#fef2f2' },
  blocked:     { label: '止まってる', color: '#9333ea', bg: '#faf5ff' },
  done:        { label: '終了', color: '#94a3b8', bg: '#f8fafc' },
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [myProfile, setMyProfile] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssignee, setNewAssignee] = useState('both');
  const [newDueDate, setNewDueDate] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active');

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
    if (saved) setMyProfile(saved);
    else window.location.href = '/';
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    fetchTodos();
    const channel = supabase.channel('public:todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myProfile]);

  const fetchTodos = async () => {
    const { data } = await supabase.from('todos').select('*').order('sort_order').order('created_at');
    if (data) setTodos(data);
  };

  const parentTodos = todos.filter(t => !t.parent_id && (filter === 'all' || filter === 'active' ? t.status !== 'done' : t.status === 'done'));
  const getChildren = (parentId: string) => todos.filter(t => t.parent_id === parentId);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addTodo = async (parentId: string | null = null) => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('todos').insert([{
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      parent_id: parentId,
      assignee: newAssignee,
      due_date: newDueDate || null,
      status: 'not_started',
      created_by: myProfile,
    }]);
    if (error) { alert('追加に失敗しました: ' + error.message); return; }
    setNewTitle(''); setNewDesc(''); setNewDueDate(''); setNewAssignee('both');
    setShowAddForm(false); setAddParentId(null);
    if (parentId) setExpandedParents(prev => new Set(prev).add(parentId));
    await fetchTodos();
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    await supabase.from('todos').update({ title: editTitle.trim(), description: editDesc.trim() || null, updated_at: new Date().toISOString() }).eq('id', id);
    setEditingId(null);
    await fetchTodos();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('todos').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchTodos();
  };

  const deleteTodo = async (id: string, title: string) => {
    const children = getChildren(id);
    const msg = children.length > 0 ? `「${title}」と小タスク${children.length}件を削除しますか？` : `「${title}」を削除しますか？`;
    if (!confirm(msg)) return;
    await supabase.from('todos').delete().eq('id', id);
    await fetchTodos();
  };

  const updateAssignee = async (id: string, assignee: string) => {
    await supabase.from('todos').update({ assignee, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchTodos();
  };

  const updateDueDate = async (id: string, due_date: string) => {
    await supabase.from('todos').update({ due_date: due_date || null, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchTodos();
  };

  const childProgress = (parentId: string) => {
    const children = getChildren(parentId);
    if (children.length === 0) return null;
    const done = children.filter(c => c.status === 'done').length;
    return `${done}/${children.length}`;
  };

  const renderTodo = (todo: Todo, isChild = false) => {
    const isDone = todo.status === 'done';
    const children = getChildren(todo.id);
    const isExpanded = expandedParents.has(todo.id);
    const progress = childProgress(todo.id);
    const statusConf = STATUS_CONFIG[todo.status] || STATUS_CONFIG.not_started;
    const isOverdue = todo.due_date && !isDone && new Date(todo.due_date) < new Date(new Date().toDateString());
    const isEditing = editingId === todo.id;

    return (
      <div key={todo.id}>
        <div style={{
          padding: '12px 16px',
          marginLeft: isChild ? '24px' : 0,
          borderLeft: isChild ? '2px solid #e2e8f0' : 'none',
          background: isDone ? '#fafafa' : 'rgba(255,255,255,0.7)',
          borderRadius: isChild ? '0 12px 12px 0' : '12px',
          marginBottom: '4px',
          border: isChild ? 'none' : '1px solid var(--glass-border)',
          opacity: isDone ? 0.6 : 1,
        }}>
          {/* 1行目: 展開 + 小タスク追加 + タイトル + ステータス + 削除 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* 展開ボタン（親のみ） */}
            {!isChild && children.length > 0 ? (
              <button onClick={() => toggleExpand(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', flexShrink: 0 }}>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : !isChild ? <div style={{ width: 20 }} /> : null}

            {/* 小タスク追加ボタン（親のみ、タイトルの左） */}
            {!isChild && (
              <button onClick={() => { setAddParentId(todo.id); setShowAddForm(true); setExpandedParents(prev => new Set(prev).add(todo.id)); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', display: 'flex', flexShrink: 0 }} title="小タスク追加">
                <Plus size={14} />
              </button>
            )}

            {/* タイトル */}
            {isEditing ? (
              <div style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(todo.id)}
                  autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }} />
                <button onClick={() => saveEdit(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', flexShrink: 0 }}><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}><X size={16} /></button>
              </div>
            ) : (
              <div onClick={() => { setEditingId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
                style={{ flex: 1, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', textDecoration: isDone ? 'line-through' : 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {todo.title}
                {progress && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '8px' }}>({progress})</span>}
              </div>
            )}

            {/* ステータス */}
            <select value={todo.status} onChange={e => updateStatus(todo.id, e.target.value)}
              style={{ fontSize: '0.65rem', padding: '3px 4px', borderRadius: '6px', border: 'none', background: statusConf.bg, color: statusConf.color, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                <option key={key} value={key}>{conf.label}</option>
              ))}
            </select>

            {/* 削除 */}
            <button onClick={() => deleteTodo(todo.id, todo.title)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>

          {/* 内容（description）表示 / 編集 */}
          {isEditing ? (
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="内容・メモ（任意）"
              style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '0.8rem', resize: 'vertical', minHeight: '50px', background: 'rgba(255,255,255,0.5)', color: 'var(--text-main)' }} />
          ) : todo.description ? (
            <div onClick={() => { setEditingId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
              style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
              {todo.description}
            </div>
          ) : null}

          {/* メタ情報（担当・期限） */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <select value={todo.assignee} onChange={e => updateAssignee(todo.id, e.target.value)}
              style={{ fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: 'var(--text-muted)' }}>
              <option value="user_a">ミルク</option>
              <option value="user_b">メリー</option>
              <option value="both">2人</option>
            </select>
            <input type="date" value={todo.due_date || ''} onChange={e => updateDueDate(todo.id, e.target.value)}
              style={{ fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`, background: isOverdue ? '#fef2f2' : '#f8fafc', color: isOverdue ? '#dc2626' : 'var(--text-muted)' }} />
          </div>
        </div>

        {/* 子タスク */}
        {!isChild && isExpanded && children.map(child => renderTodo(child, true))}

        {/* 子タスク追加フォーム */}
        {!isChild && isExpanded && addParentId === todo.id && showAddForm && (
          <div style={{ marginLeft: '24px', padding: '8px 16px', borderLeft: '2px solid #e2e8f0', marginBottom: '4px' }}>
            {renderAddForm(todo.id)}
          </div>
        )}
      </div>
    );
  };

  const renderAddForm = (parentId: string | null = null) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={parentId ? "小タスクのタイトル" : "タスクのタイトル"}
        autoFocus onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addTodo(parentId)}
        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'rgba(255,255,255,0.8)' }} />
      <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="内容・メモ（任意）"
        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.8)', resize: 'vertical', minHeight: '40px' }} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>
          <option value="both">2人</option>
          <option value="user_a">ミルク</option>
          <option value="user_b">メリー</option>
        </select>
        <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '0.8rem' }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => addTodo(parentId)} style={{ background: '#9370db', color: 'white', padding: '6px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem' }}>追加</button>
        <button onClick={() => { setShowAddForm(false); setAddParentId(null); setNewTitle(''); setNewDesc(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
      </div>
    </div>
  );

  if (!myProfile) return null;
  const doneTodos = todos.filter(t => !t.parent_id && t.status === 'done');

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>TODOリスト</h1>
        <button onClick={() => { setShowAddForm(true); setAddParentId(null); }}
          style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '12px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={16} /> 新規タスク
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
        {(['active', 'done', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: filter === f ? '#9370db' : '#f1f5f9', color: filter === f ? 'white' : 'var(--text-muted)'
          }}>
            {f === 'active' ? '進行中' : f === 'done' ? `完了 (${doneTodos.length})` : 'すべて'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {showAddForm && addParentId === null && (
          <div style={{ background: 'rgba(255,255,255,0.8)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '8px' }}>
            {renderAddForm(null)}
          </div>
        )}

        {filter === 'done' ? doneTodos.map(t => renderTodo(t)) : parentTodos.map(t => renderTodo(t))}

        {parentTodos.length === 0 && !showAddForm && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <p style={{ fontSize: '1rem', marginBottom: '8px' }}>タスクがありません</p>
            <p style={{ fontSize: '0.8rem' }}>「新規タスク」から追加してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
