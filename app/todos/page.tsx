"use client";

import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Check, X, Bell, BellOff } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

// ===== Types =====

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
};

type Reminder = {
  id: string;
  message: string;
  schedule_type: string;
  schedule_detail: any;
  next_run_at: string;
  is_active: boolean;
  created_by?: string;
};

// ===== Constants =====

const STATUS = {
  not_started: { label: 'まだ', color: '#94a3b8', bg: '#f1f5f9' },
  on_track:    { label: '順調', color: '#16a34a', bg: '#dcfce7' },
  trouble:     { label: 'トラブル', color: '#ea580c', bg: '#fff7ed' },
  delayed:     { label: '遅れてる', color: '#dc2626', bg: '#fef2f2' },
  blocked:     { label: '止まってる', color: '#9333ea', bg: '#faf5ff' },
  done:        { label: '完了', color: '#94a3b8', bg: '#f8fafc' },
} as const;

const SCHEDULE_LABELS: Record<string, string> = {
  once: '1回', daily: '毎日', weekly: '毎週',
  monthly: '毎月', monthly_date: '毎月', monthly_nth: '毎月第N',
};

const DAYS = ['', '月', '火', '水', '木', '金', '土', '日'];

export default function TodosPage() {
  const [myProfile, setMyProfile] = useState<string | null>(null);
  const [tab, setTab] = useState<'tasks' | 'reminders' | 'done'>('tasks');

  // Tasks
  const [todos, setTodos] = useState<Todo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Add task form
  const [showAdd, setShowAdd] = useState(false);
  const [addParent, setAddParent] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssignee, setNewAssignee] = useState('both');
  const [newDue, setNewDue] = useState('');

  // Reminders
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminderAdd, setShowReminderAdd] = useState(false);
  const [rMsg, setRMsg] = useState('');
  const [rType, setRType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('09:00');
  const [rDay, setRDay] = useState(1);
  const [rMonthlyMode, setRMonthlyMode] = useState<'date' | 'nth'>('date');
  const [rDayOfMonth, setRDayOfMonth] = useState(1);
  const [rNthWeek, setRNthWeek] = useState(1);

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
    if (saved) setMyProfile(saved);
    else window.location.href = '/';
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    fetchAll();
    const ch1 = supabase.channel('todos-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos()).subscribe();
    const ch2 = supabase.channel('reminders-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_reminders' }, () => fetchReminders()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [myProfile]);

  const fetchAll = () => { fetchTodos(); fetchReminders(); };
  const fetchTodos = async () => {
    const { data } = await supabase.from('todos').select('*').order('sort_order').order('created_at');
    if (data) setTodos(data);
  };
  const fetchReminders = async () => {
    const { data } = await supabase.from('scheduled_reminders').select('*').order('next_run_at');
    if (data) setReminders(data);
  };

  const parents = todos.filter(t => !t.parent_id);
  const activeTasks = parents.filter(t => t.status !== 'done');
  const doneTasks = parents.filter(t => t.status === 'done');
  const children = (pid: string) => todos.filter(t => t.parent_id === pid);

  // ===== Task CRUD =====

  const addTask = async (parentId: string | null = null) => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('todos').insert([{
      title: newTitle.trim(), description: newDesc.trim() || null,
      parent_id: parentId, assignee: newAssignee,
      due_date: newDue || null, status: 'not_started', created_by: myProfile,
    }]);
    if (error) { alert('エラー: ' + error.message); return; }
    setNewTitle(''); setNewDesc(''); setNewDue(''); setNewAssignee('both');
    setShowAdd(false); setAddParent(null);
    if (parentId) setExpanded(prev => new Set(prev).add(parentId));
    await fetchTodos();
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    await supabase.from('todos').update({ title: editTitle.trim(), description: editDesc.trim() || null, updated_at: new Date().toISOString() }).eq('id', id);
    setEditId(null); await fetchTodos();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from('todos').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchTodos();
  };

  const deleteTask = async (id: string, title: string) => {
    const kids = children(id);
    if (!confirm(kids.length > 0 ? `「${title}」と小タスク${kids.length}件を削除？` : `「${title}」を削除？`)) return;
    await supabase.from('todos').delete().eq('id', id); await fetchTodos();
  };

  const setAssignee = async (id: string, v: string) => {
    await supabase.from('todos').update({ assignee: v, updated_at: new Date().toISOString() }).eq('id', id); await fetchTodos();
  };
  const setDue = async (id: string, v: string) => {
    await supabase.from('todos').update({ due_date: v || null, updated_at: new Date().toISOString() }).eq('id', id); await fetchTodos();
  };

  // ===== Reminder CRUD =====

  const addReminder = async () => {
    if (!rMsg.trim() || !rTime) return alert('メッセージと時間は必須です');
    if (rType === 'once' && !rDate) return alert('日付を入力してください');

    let nextRun = new Date();
    let finalType = rType as string;
    const detail: any = { time: rTime };
    const [h, m] = rTime.split(':').map(Number);

    if (rType === 'once') {
      nextRun = new Date(`${rDate}T${rTime}:00`);
    } else {
      nextRun.setHours(h, m, 0, 0);
      if (nextRun <= new Date()) nextRun.setDate(nextRun.getDate() + 1);

      if (rType === 'weekly') {
        detail.dayOfWeek = rDay;
        const jsDay = rDay === 7 ? 0 : rDay;
        while (nextRun.getDay() !== jsDay) nextRun.setDate(nextRun.getDate() + 1);
      } else if (rType === 'monthly') {
        if (rMonthlyMode === 'date') {
          finalType = 'monthly_date'; detail.dayOfMonth = rDayOfMonth;
          nextRun.setDate(Math.min(rDayOfMonth, new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate()));
          nextRun.setHours(h, m, 0, 0);
          if (nextRun <= new Date()) { nextRun.setMonth(nextRun.getMonth() + 1); nextRun.setDate(Math.min(rDayOfMonth, new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate())); }
        } else {
          finalType = 'monthly_nth'; detail.nthWeek = rNthWeek; detail.dayOfWeek = rDay;
          const jsDay = rDay === 7 ? 0 : rDay;
          let tmp = new Date(nextRun.getFullYear(), nextRun.getMonth(), 1, h, m, 0);
          let cnt = 0;
          while (tmp.getMonth() === nextRun.getMonth()) { if (tmp.getDay() === jsDay) { cnt++; if (cnt === rNthWeek) break; } tmp.setDate(tmp.getDate() + 1); }
          if (tmp <= new Date() || cnt !== rNthWeek) { tmp = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 1, h, m, 0); cnt = 0; while (true) { if (tmp.getDay() === jsDay) { cnt++; if (cnt === rNthWeek) break; } tmp.setDate(tmp.getDate() + 1); } }
          nextRun = tmp;
        }
      }
    }

    const { error } = await supabase.from('scheduled_reminders').insert([{
      message: rMsg.trim(), schedule_type: finalType, schedule_detail: detail,
      next_run_at: nextRun.toISOString(), is_active: true, created_by: myProfile || 'unknown'
    }]);
    if (error) { alert('エラー: ' + error.message); return; }

    // もちに通知
    const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
    await supabase.from('messages').insert([{ text: `${name}さんがリマインダー「${rMsg.trim()}」を追加しました。`, user_id: 'mochi' }]);

    setRMsg(''); setShowReminderAdd(false); await fetchReminders();
  };

  const toggleReminder = async (id: string, active: boolean) => {
    await supabase.from('scheduled_reminders').update({ is_active: !active }).eq('id', id); await fetchReminders();
  };
  const deleteReminder = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await supabase.from('scheduled_reminders').delete().eq('id', id); await fetchReminders();
  };

  // ===== Render helpers =====

  const progress = (pid: string) => {
    const kids = children(pid);
    if (!kids.length) return null;
    return { done: kids.filter(c => c.status === 'done').length, total: kids.length };
  };

  const TaskCard = ({ todo, isChild = false }: { todo: Todo; isChild?: boolean }) => {
    const isDone = todo.status === 'done';
    const kids = children(todo.id);
    const isOpen = expanded.has(todo.id);
    const prog = progress(todo.id);
    const st = STATUS[todo.status as keyof typeof STATUS] || STATUS.not_started;
    const overdue = todo.due_date && !isDone && new Date(todo.due_date) < new Date(new Date().toDateString());
    const editing = editId === todo.id;
    const assigneeLabel = todo.assignee === 'user_a' ? 'ミルク' : todo.assignee === 'user_b' ? 'メリー' : '2人';
    const dueDateLabel = todo.due_date ? new Date(todo.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '期限なし';

    return (
      <div>
        <div style={{
          padding: '12px 14px', marginLeft: isChild ? '20px' : 0,
          borderLeft: isChild ? '3px solid #e2e8f0' : 'none',
          background: isDone ? 'rgba(248,250,252,0.8)' : 'rgba(255,255,255,0.85)',
          borderRadius: isChild ? '0 14px 14px 0' : '14px',
          marginBottom: '6px', border: isChild ? 'none' : '1px solid rgba(0,0,0,0.06)',
          opacity: isDone ? 0.5 : 1, boxShadow: isChild ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Row 1 (top): meta chips + delete */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            {/* 展開ボタン */}
            {!isChild && kids.length > 0 ? (
              <button onClick={() => { const n = new Set(expanded); isOpen ? n.delete(todo.id) : n.add(todo.id); setExpanded(n); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', flexShrink: 0 }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : !isChild ? <div style={{ width: 14 }} /> : null}

            {/* 小タスク追加（親のみ） */}
            {!isChild && (
              <button onClick={() => { setAddParent(todo.id); setShowAdd(true); setExpanded(prev => new Set(prev).add(todo.id)); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0, display: 'flex', flexShrink: 0 }} title="小タスク追加">
                <Plus size={13} />
              </button>
            )}

            {/* メタ情報チップ（編集モードでselect/input、通常モードでタップ可能ラベル） */}
            {editing ? (
              <>
                <select value={todo.assignee} onChange={e => setAssignee(todo.id, e.target.value)}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600 }}>
                  <option value="user_a">ミルク</option><option value="user_b">メリー</option><option value="both">2人</option>
                </select>
                <input type="date" value={todo.due_date || ''} onChange={e => setDue(todo.id, e.target.value)}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '10px', border: `1px solid ${overdue ? '#fca5a5' : '#e2e8f0'}`, background: overdue ? '#fef2f2' : 'white', color: overdue ? '#dc2626' : '#64748b' }} />
                <select value={todo.status} onChange={e => setStatus(todo.id, e.target.value)}
                  style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '10px', border: 'none', background: st.bg, color: st.color, fontWeight: 700, cursor: 'pointer' }}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </>
            ) : (
              <>
                <span onClick={() => { setEditId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
                  style={{ fontSize: '0.63rem', padding: '2px 8px', borderRadius: '10px', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                  {assigneeLabel}
                </span>
                <span onClick={() => { setEditId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
                  style={{ fontSize: '0.63rem', padding: '2px 8px', borderRadius: '10px', background: overdue ? '#fef2f2' : '#f8fafc', color: overdue ? '#dc2626' : '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                  {dueDateLabel}
                </span>
                <span onClick={() => { setEditId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
                  style={{ fontSize: '0.63rem', padding: '2px 8px', borderRadius: '10px', background: st.bg, color: st.color, fontWeight: 700, cursor: 'pointer' }}>
                  {st.label}
                </span>
              </>
            )}

            <div style={{ flex: 1 }} />

            {/* プログレスバー */}
            {prog && (
              <div style={{ width: '36px', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${(prog.done / prog.total) * 100}%`, background: '#9370db', borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
            )}

            {/* 削除 */}
            <button onClick={() => deleteTask(todo.id, todo.title)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 0, flexShrink: 0 }}>
              <Trash2 size={13} />
            </button>
          </div>

          {/* Row 2 (bottom): title */}
          {editing ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(todo.id)}
                autoFocus style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.88rem', background: 'white', fontWeight: 600 }} />
              <button onClick={() => saveEdit(todo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={16} /></button>
              <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>
          ) : (
            <div onClick={() => { setEditId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
              style={{ cursor: 'pointer', fontSize: '0.92rem', fontWeight: 600, color: isDone ? '#94a3b8' : 'var(--text-main)', textDecoration: isDone ? 'line-through' : 'none' }}>
              {todo.title}
            </div>
          )}

          {/* Description */}
          {editing ? (
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="メモ（任意）"
              style={{ width: '100%', marginTop: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', resize: 'vertical', minHeight: '44px', background: 'white', color: 'var(--text-main)' }} />
          ) : todo.description ? (
            <p onClick={() => { setEditId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ''); }}
              style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.45, cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
              {todo.description}
            </p>
          ) : null}
        </div>

        {/* Children */}
        {!isChild && isOpen && kids.map(c => <TaskCard key={c.id} todo={c} isChild />)}
        {!isChild && isOpen && addParent === todo.id && showAdd && (
          <div style={{ marginLeft: '20px', padding: '10px 16px', borderLeft: '3px solid #e2e8f0', marginBottom: '6px' }}>
            <AddForm parentId={todo.id} />
          </div>
        )}
      </div>
    );
  };

  const AddForm = ({ parentId = null }: { parentId?: string | null }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={parentId ? "小タスク" : "新しいタスク"}
        autoFocus onKeyDown={e => e.key === 'Enter' && addTask(parentId)}
        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.88rem', background: 'white' }} />
      <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="メモ（任意）"
        style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white', resize: 'vertical', minHeight: '36px' }} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem', background: 'white' }}>
          <option value="both">2人</option><option value="user_a">ミルク</option><option value="user_b">メリー</option>
        </select>
        <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem', background: 'white' }} />
        <div style={{ flex: 1 }} />
        <button onClick={() => addTask(parentId)} style={{ background: '#9370db', color: 'white', padding: '7px 18px', borderRadius: '10px', fontWeight: 600, fontSize: '0.8rem' }}>追加</button>
        <button onClick={() => { setShowAdd(false); setAddParent(null); setNewTitle(''); setNewDesc(''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
      </div>
    </div>
  );

  const ReminderCard = ({ r }: { r: Reminder }) => {
    const typeLabel = SCHEDULE_LABELS[r.schedule_type] || r.schedule_type;
    const detail = r.schedule_detail || {};
    let scheduleDesc = typeLabel;
    if (r.schedule_type === 'weekly' && detail.dayOfWeek) scheduleDesc += DAYS[detail.dayOfWeek] + '曜';
    if (r.schedule_type === 'monthly_date' && detail.dayOfMonth) scheduleDesc += detail.dayOfMonth + '日';
    if (r.schedule_type === 'monthly_nth') scheduleDesc = `毎月第${detail.nthWeek}${DAYS[detail.dayOfWeek] || ''}曜`;
    if (detail.time) scheduleDesc += ' ' + detail.time;

    return (
      <div style={{
        padding: '14px 16px', background: r.is_active ? 'rgba(255,255,255,0.85)' : 'rgba(248,250,252,0.7)',
        borderRadius: '14px', marginBottom: '6px', border: '1px solid rgba(0,0,0,0.06)',
        opacity: r.is_active ? 1 : 0.5, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => toggleReminder(r.id, r.is_active)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.is_active ? '#9370db' : '#cbd5e1', padding: 0, flexShrink: 0 }}>
            {r.is_active ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ background: '#f0ebff', color: '#9370db', padding: '1px 8px', borderRadius: '6px', fontWeight: 600 }}>{scheduleDesc}</span>
              <span>次回: {new Date(r.next_run_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              {r.created_by && <span>{r.created_by === 'user_a' ? 'ミルク' : 'メリー'}</span>}
            </div>
          </div>
          <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 0, flexShrink: 0 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  if (!myProfile) return null;

  const tabs = [
    { id: 'tasks' as const, label: 'タスク', count: activeTasks.length },
    { id: 'reminders' as const, label: 'リマインダー', count: reminders.filter(r => r.is_active).length },
    { id: 'done' as const, label: '完了', count: doneTasks.length },
  ];

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', background: 'var(--glass-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>TODO / リマインダー</h1>
        <button onClick={() => { tab === 'reminders' ? setShowReminderAdd(true) : (() => { setShowAdd(true); setAddParent(null); })(); }}
          style={{ background: '#9370db', color: 'white', padding: '7px 14px', borderRadius: '10px', fontWeight: 600, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={15} /> {tab === 'reminders' ? 'リマインダー' : 'タスク'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', background: 'var(--glass-bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #9370db' : '2px solid transparent',
            color: tab === t.id ? '#9370db' : '#94a3b8', fontWeight: tab === t.id ? 700 : 600,
            fontSize: '0.8rem', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
          }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize: '0.65rem', background: tab === t.id ? '#f0ebff' : '#f1f5f9', color: tab === t.id ? '#9370db' : '#94a3b8', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

        {/* ===== Tasks Tab ===== */}
        {tab === 'tasks' && (
          <>
            {showAdd && addParent === null && (
              <div style={{ background: 'rgba(255,255,255,0.9)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: '10px' }}>
                <AddForm />
              </div>
            )}
            {activeTasks.length === 0 && !showAdd ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                <p style={{ fontSize: '0.95rem', marginBottom: '6px' }}>タスクがありません</p>
                <p style={{ fontSize: '0.78rem' }}>右上の「＋タスク」から追加</p>
              </div>
            ) : activeTasks.map(t => <TaskCard key={t.id} todo={t} />)}
          </>
        )}

        {/* ===== Reminders Tab ===== */}
        {tab === 'reminders' && (
          <>
            {showReminderAdd && (
              <div style={{ background: 'rgba(255,255,255,0.9)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input value={rMsg} onChange={e => setRMsg(e.target.value)} placeholder="リマインダーの内容"
                    autoFocus style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.88rem', background: 'white' }} />

                  {/* Schedule chips */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['once', 'daily', 'weekly', 'monthly'] as const).map(t => (
                      <button key={t} onClick={() => setRType(t)} style={{
                        padding: '6px 14px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: rType === t ? '#9370db' : '#f1f5f9', color: rType === t ? 'white' : '#64748b'
                      }}>
                        {t === 'once' ? '1回' : t === 'daily' ? '毎日' : t === 'weekly' ? '毎週' : '毎月'}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {rType === 'once' && (
                      <input type="date" value={rDate} onChange={e => setRDate(e.target.value)}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }} />
                    )}
                    {rType === 'weekly' && (
                      <select value={rDay} onChange={e => setRDay(Number(e.target.value))}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }}>
                        {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}曜日</option>)}
                      </select>
                    )}
                    {rType === 'monthly' && (
                      <>
                        <select value={rMonthlyMode} onChange={e => setRMonthlyMode(e.target.value as 'date' | 'nth')}
                          style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }}>
                          <option value="date">毎月○日</option><option value="nth">第N曜日</option>
                        </select>
                        {rMonthlyMode === 'date' ? (
                          <select value={rDayOfMonth} onChange={e => setRDayOfMonth(Number(e.target.value))}
                            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }}>
                            {Array.from({length: 31}, (_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                          </select>
                        ) : (
                          <>
                            <select value={rNthWeek} onChange={e => setRNthWeek(Number(e.target.value))}
                              style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }}>
                              {[1,2,3,4,5].map(n => <option key={n} value={n}>第{n}</option>)}
                            </select>
                            <select value={rDay} onChange={e => setRDay(Number(e.target.value))}
                              style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }}>
                              {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}曜</option>)}
                            </select>
                          </>
                        )}
                      </>
                    )}
                    <input type="time" value={rTime} onChange={e => setRTime(e.target.value)}
                      style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', background: 'white' }} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowReminderAdd(false)} style={{ padding: '7px 16px', borderRadius: '10px', border: 'none', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>キャンセル</button>
                    <button onClick={addReminder} style={{ padding: '7px 18px', borderRadius: '10px', border: 'none', background: '#9370db', color: 'white', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>追加</button>
                  </div>
                </div>
              </div>
            )}
            {reminders.length === 0 && !showReminderAdd ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                <p style={{ fontSize: '0.95rem', marginBottom: '6px' }}>リマインダーがありません</p>
                <p style={{ fontSize: '0.78rem' }}>右上の「＋リマインダー」から追加</p>
              </div>
            ) : reminders.map(r => <ReminderCard key={r.id} r={r} />)}
          </>
        )}

        {/* ===== Done Tab ===== */}
        {tab === 'done' && (
          doneTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <p style={{ fontSize: '0.95rem' }}>完了したタスクはありません</p>
            </div>
          ) : doneTasks.map(t => <TaskCard key={t.id} todo={t} />)
        )}
      </div>
    </div>
  );
}
