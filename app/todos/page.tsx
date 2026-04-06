"use client";

import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Edit3, Check, X } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import Link from 'next/link';

type Todo = {
  id: string;
  parent_id: string | null;
  title: string;
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

const ASSIGNEE_LABELS: Record<string, string> = {
  user_a: 'ミルク',
  user_b: 'メリー',
  both: '2人',
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [myProfile, setMyProfile] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
        fetchTodos();
      }).subscribe();
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
      parent_id: parentId,
      assignee: newAssignee,
      due_date: newDueDate || null,
      status: 'not_started',
      created_by: myProfile,
    }]);
    if (error) {
      console.error('Todo insert error:', error);
      alert('追加に失敗しました: ' + error.message);
      return;
    }
    setNewTitle('');
    setNewDueDate('');
    setNewAssignee('both');
    setShowAddForm(false);
    setAddParentId(null);
    if (parentId) setExpandedParents(prev => new Set(prev).add(parentId));
    await fetchTodos();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('todos').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchTodos();
  };

  const updateTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    await supabase.from('todos').update({ title: editTitle.trim(), updated_at: new Date().toISOString() }).eq('id', id);
    setEditingId(null);
  };

  const deleteTodo = async (id: string, title: string) => {
    const children = getChildren(id);
    const msg = children.length > 0
      ? `「${title}」と小タスク${children.length}件を削除しますか？`
      : `「${title}」を削除しますか？`;
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

    return (
      <div key={todo.id}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
          marginLeft: isChild ? '24px' : 0,
          borderLeft: isChild ? '2px solid #e2e8f0' : 'none',
          background: isDone ? '#fafafa' : 'rgba(255,255,255,0.7)',
          borderRadius: isChild ? '0 12px 12px 0' : '12px',
          marginBottom: '4px',
          border: isChild ? 'none' : '1px solid var(--glass-border)',
          opacity: isDone ? 0.6 : 1,
        }}>
          {/* 展開/折り畳みボタン（親タスクのみ） */}
          {!isChild && children.length > 0 ? (
            <button onClick={() => toggleExpand(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : (
            <div style={{ width: isChild ? 0 : 20 }} />
          )}

          {/* タイトル */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingId === todo.id ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateTitle(todo.id)}
                  autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }} />
                <button onClick={() => updateTitle(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
              </div>
            ) : (
              <div onClick={() => { setEditingId(todo.id); setEditTitle(todo.title); }} style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', textDecoration: isDone ? 'line-through' : 'none' }}>
                {todo.title}
                {progress && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '8px' }}>({progress})</span>}
              </div>
            )}

            {/* メタ情報 */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              {/* 担当 */}
              <select value={todo.assignee} onChange={e => updateAssignee(todo.id, e.target.value)}
                style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: 'var(--text-muted)' }}>
                <option value="user_a">ミルク</option>
                <option value="user_b">メリー</option>
                <option value="both">2人</option>
              </select>

              {/* 期限 */}
              <input type="date" value={todo.due_date || ''} onChange={e => updateDueDate(todo.id, e.target.value)}
                style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`, background: isOverdue ? '#fef2f2' : '#f8fafc', color: isOverdue ? '#dc2626' : 'var(--text-muted)' }} />
            </div>
          </div>

          {/* ステータス */}
          <select value={todo.status} onChange={e => updateStatus(todo.id, e.target.value)}
            style={{ fontSize: '0.7rem', padding: '4px 6px', borderRadius: '8px', border: 'none', background: statusConf.bg, color: statusConf.color, fontWeight: 700, cursor: 'pointer' }}>
            {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
              <option key={key} value={key}>{conf.label}</option>
            ))}
          </select>

          {/* 小タスク追加ボタン（親タスクのみ） */}
          {!isChild && (
            <button onClick={() => { setAddParentId(todo.id); setShowAddForm(true); setExpandedParents(prev => new Set(prev).add(todo.id)); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }} title="小タスク追加">
              <Plus size={14} />
            </button>
          )}

          {/* 削除 */}
          <button onClick={() => deleteTodo(todo.id, todo.title)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '4px' }}>
            <Trash2 size={14} />
          </button>
        </div>

        {/* 子タスク */}
        {!isChild && isExpanded && children.map(child => renderTodo(child, true))}

        {/* 子タスク追加フォーム（インライン） */}
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
        autoFocus onKeyDown={e => e.key === 'Enter' && addTodo(parentId)}
        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.9rem', background: 'rgba(255,255,255,0.8)' }} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
        <button onClick={() => { setShowAddForm(false); setAddParentId(null); setNewTitle(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
      </div>
    </div>
  );

  if (!myProfile) return null;

  const doneTodos = todos.filter(t => !t.parent_id && t.status === 'done');

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>TODOリスト</h1>
        <button onClick={() => { setShowAddForm(true); setAddParentId(null); }}
          style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '12px', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={16} /> 新規タスク
        </button>
      </div>

      {/* Filter */}
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

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* トップレベル追加フォーム */}
        {showAddForm && addParentId === null && (
          <div style={{ background: 'rgba(255,255,255,0.8)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '8px' }}>
            {renderAddForm(null)}
          </div>
        )}

        {filter === 'done'
          ? doneTodos.map(t => renderTodo(t))
          : parentTodos.map(t => renderTodo(t))
        }

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
