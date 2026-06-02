"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Check, X, Bell, BellOff, Edit2 } from 'lucide-react';
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
  mochi_reminders?: number[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
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

interface EditingTodo {
  id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  assignee: string;
  due_date: string;
  status: string;
  mochi_reminders: number[];
}

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
  
  // Modals state
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<EditingTodo | null>(null);

  // Reminders
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [editReminderId, setEditReminderId] = useState<string | null>(null);
  const [rMsg, setRMsg] = useState('');
  const [rType, setRType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('09:00');
  const [rDay, setRDay] = useState(1);
  const [rMonthlyMode, setRMonthlyMode] = useState<'date' | 'nth' | 'interval'>('date');
  const [rIntervalSubMode, setRIntervalSubMode] = useState<'date' | 'nth'>('date'); // 「それ以上」モードのサブ選択
  const [rDayOfMonth, setRDayOfMonth] = useState(1);
  const [rNthWeek, setRNthWeek] = useState(1);
  const [rIntervalMonths, setRIntervalMonths] = useState(2);
  const [rStartYear, setRStartYear] = useState(() => new Date().getFullYear());
  const [rStartMonth, setRStartMonth] = useState(() => new Date().getMonth() + 1);
  const [monthlyChooserOpen, setMonthlyChooserOpen] = useState(false);
  const [todoTemplates, setTodoTemplates] = useState<any>({
    create: '{name}さんがTODO「{title}」を追加しました。',
    update: '{name}さんがTODO「{title}」を更新しました。',
    delete: '{name}さんがTODO「{title}」を削除しました。',
    status: '{name}さんがTODO「{title}」のステータスを「{status}」に変更しました。',
    reminder_add: '{name}さんがリマインダー「{title}」を追加しました。'
  });

  useEffect(() => {
    const saved = localStorage.getItem('boshi_profile');
    if (saved) setMyProfile(saved);
    else window.location.href = '/';
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    fetchAll();
    const ch1 = supabase.channel('todos-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
      if (!isTodoModalOpen) fetchTodos();
    }).subscribe();
    const ch2 = supabase.channel('reminders-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_reminders' }, () => fetchReminders()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [myProfile, isTodoModalOpen]);

  const fetchSettings = async () => {
    const { data } = await supabase.from('couple_settings').select('todo_templates').limit(1).single();
    if (data && data.todo_templates) setTodoTemplates(data.todo_templates);
  };
  const fetchAll = () => { fetchTodos(); fetchReminders(); fetchSettings(); };
  const fetchTodos = async () => {
    const { data } = await supabase.from('todos').select('*').order('sort_order').order('created_at');
    if (data) setTodos(data);
  };
  const fetchReminders = async () => {
    const { data } = await supabase.from('scheduled_reminders').select('*').order('next_run_at');
    if (data) setReminders(data);
  };

  const parents = todos.filter(t => !t.parent_id);
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeTasks = parents.filter(t => t.status !== 'done');
  const recentlyDone = parents.filter(t => t.status === 'done' && new Date(t.updated_at || t.created_at).getTime() > oneWeekAgo);
  const taskTabItems = [...activeTasks, ...recentlyDone];
  const doneTasks = parents.filter(t => t.status === 'done' && new Date(t.updated_at || t.created_at).getTime() <= oneWeekAgo);
  const children = (pid: string) => todos.filter(t => t.parent_id === pid);

  // ===== Task CRUD =====

  const openTodoModal = (t?: Todo, parentId?: string | null) => {
    if (t) {
      setEditingTodo({
        id: t.id, parent_id: t.parent_id, title: t.title, description: t.description || '',
        assignee: t.assignee, due_date: t.due_date || '', status: t.status, mochi_reminders: t.mochi_reminders || []
      });
    } else {
      setEditingTodo({
        id: null, parent_id: parentId || null, title: '', description: '',
        assignee: 'both', due_date: '', status: 'not_started', mochi_reminders: []
      });
    }
    setIsTodoModalOpen(true);
  };

  const saveTodo = async () => {
    if (!editingTodo?.title.trim()) return;
    const { id, parent_id, title, description, assignee, due_date, status, mochi_reminders } = editingTodo;
    if (id) {
       await supabase.from('todos').update({ 
         title: title.trim(), description: description.trim() || null, 
         assignee, due_date: due_date || null, status, mochi_reminders, updated_at: new Date().toISOString() 
       }).eq('id', id);
       
       // もちに通知
       const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
       const msg = todoTemplates.update.replace('{name}', name).replace('{title}', title.trim());
       await supabase.from('messages').insert([{ text: msg, user_id: 'mochi' }]);
    } else {
       await supabase.from('todos').insert([{ 
         title: title.trim(), description: description.trim() || null, 
         parent_id, assignee, due_date: due_date || null, status: 'not_started', mochi_reminders, created_by: myProfile 
       }]);
       if (parent_id) setExpanded(prev => new Set(prev).add(parent_id));

       // もちに通知
       const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
       const msg = todoTemplates.create.replace('{name}', name).replace('{title}', title.trim());
       await supabase.from('messages').insert([{ text: msg, user_id: 'mochi' }]);
    }
    setIsTodoModalOpen(false);
    setEditingTodo(null);
    await fetchTodos();
  };

  const deleteTask = async (id: string, title: string) => {
    const kids = children(id);
    if (!confirm(kids.length > 0 ? `「${title}」と小タスク${kids.length}件を削除しますか？` : `「${title}」を削除しますか？`)) return;
    await supabase.from('todos').delete().eq('id', id); await fetchTodos();
    
    // もちに通知
    const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
    const msg = todoTemplates.delete.replace('{name}', name).replace('{title}', title);
    await supabase.from('messages').insert([{ text: msg, user_id: 'mochi' }]);
  };

  // Immediate update toggles from Card
  const setStatus = async (id: string, status: string) => {
    await supabase.from('todos').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, status } : t));

    // もちに通知
    const todo = todos.find(t => t.id === id);
    if (todo && todo.status !== status) {
      const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
      const statusLabel = STATUS[status as keyof typeof STATUS]?.label || status;
      const msg = todoTemplates.status.replace('{name}', name).replace('{title}', todo.title).replace('{status}', statusLabel);
      await supabase.from('messages').insert([{ text: msg, user_id: 'mochi' }]);
    }
  };
  const setAssignee = async (id: string, v: string) => {
    await supabase.from('todos').update({ assignee: v, updated_at: new Date().toISOString() }).eq('id', id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, assignee: v } : t));
  };
  const setDue = async (id: string, v: string) => {
    await supabase.from('todos').update({ due_date: v || null, updated_at: new Date().toISOString() }).eq('id', id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, due_date: v || null } : t));
  };


  // ===== Reminder CRUD =====

  const saveReminder = async (id?: string) => {
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
        // rMonthlyMode = 'date' | 'nth' | 'interval'
        // 'interval' は Nヶ月に 1 回の意味で、 サブモード (rIntervalSubMode) で date / nth を選ぶ
        const effectiveMode = rMonthlyMode === 'interval' ? rIntervalSubMode : rMonthlyMode;
        const interval = rMonthlyMode === 'interval' ? Math.max(1, Number(rIntervalMonths) || 1) : 1;
        detail.intervalMonths = interval;
        if (rMonthlyMode === 'interval') {
          // 開始年月を保存しておく (将来また UI で読み戻したい時用)
          detail.startYear = rStartYear;
          detail.startMonth = rStartMonth;
        }
        // 候補基準日を決める: interval モードなら指定された開始年月、 それ以外は今月
        const candidateYear = rMonthlyMode === 'interval' ? rStartYear : nextRun.getFullYear();
        const candidateMonth = rMonthlyMode === 'interval' ? rStartMonth - 1 : nextRun.getMonth();
        if (effectiveMode === 'date') {
          finalType = 'monthly_date'; detail.dayOfMonth = rDayOfMonth;
          const baseLastDay = new Date(candidateYear, candidateMonth + 1, 0).getDate();
          nextRun = new Date(candidateYear, candidateMonth, Math.min(rDayOfMonth, baseLastDay), h, m, 0, 0);
          // 過去になっていたら interval ヶ月ずつ進める
          while (nextRun <= new Date()) {
            const next = new Date(nextRun);
            next.setMonth(next.getMonth() + interval, 1);
            const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            next.setDate(Math.min(rDayOfMonth, last));
            next.setHours(h, m, 0, 0);
            nextRun = next;
          }
        } else {
          finalType = 'monthly_nth'; detail.nthWeek = rNthWeek; detail.dayOfWeek = rDay;
          const jsDay = rDay === 7 ? 0 : rDay;
          // candidate(Year, Month) の1日を起点に nthWeek 番目の jsDay 曜日を探す
          const findNthWeekday = (y: number, mo: number): Date | null => {
            const start = new Date(y, mo, 1, h, m, 0);
            let cnt = 0;
            const tmp = new Date(start);
            while (tmp.getMonth() === mo) {
              if (tmp.getDay() === jsDay) { cnt++; if (cnt === rNthWeek) return new Date(tmp); }
              tmp.setDate(tmp.getDate() + 1);
            }
            return null;
          };
          let tmp = findNthWeekday(candidateYear, candidateMonth);
          // 該当日無し or 過去 → interval ヶ月後を試す
          while (!tmp || tmp <= new Date()) {
            const baseY = tmp ? tmp.getFullYear() : candidateYear;
            const baseM = tmp ? tmp.getMonth() : candidateMonth;
            const nextY = new Date(baseY, baseM + interval, 1).getFullYear();
            const nextM = new Date(baseY, baseM + interval, 1).getMonth();
            tmp = findNthWeekday(nextY, nextM);
            if (!tmp) {
              // 念のため無限ループ防止: 12 ヶ月以上先まで進めても見つからない異常ケースは中断
              if (nextY - candidateYear > 2) break;
            }
          }
          if (tmp) nextRun = tmp;
        }
      }
    }

    if (id) {
      const { error } = await supabase.from('scheduled_reminders').update({
        message: rMsg.trim(), schedule_type: finalType, schedule_detail: detail,
        next_run_at: nextRun.toISOString()
      }).eq('id', id);
      if (error) { alert('エラー: ' + error.message); return; }
      setEditReminderId(null);
    } else {
      const { error } = await supabase.from('scheduled_reminders').insert([{
        message: rMsg.trim(), schedule_type: finalType, schedule_detail: detail,
        next_run_at: nextRun.toISOString(), is_active: true, created_by: myProfile || 'unknown'
      }]);
      if (error) { alert('エラー: ' + error.message); return; }

      // もちに通知
      const name = myProfile === 'user_a' ? 'ミルク' : 'メリー';
      const msg = (todoTemplates.reminder_add || '{name}さんがリマインダー「{title}」を追加しました。')
        .replace('{name}', name)
        .replace('{title}', rMsg.trim());
      await supabase.from('messages').insert([{ text: msg, user_id: 'mochi' }]);
    }

    setIsReminderModalOpen(false);
    setRMsg(''); await fetchReminders();
  };

  const startEditReminder = (r: Reminder) => {
    setEditReminderId(r.id);
    setRMsg(r.message);
    const detail = r.schedule_detail || {};
    const interval = Math.max(1, Number(detail.intervalMonths) || 1);
    if (r.schedule_type === 'monthly_date' || r.schedule_type === 'monthly_nth') {
      setRType('monthly');
      const subMode = r.schedule_type === 'monthly_date' ? 'date' : 'nth';
      if (interval > 1) {
        setRMonthlyMode('interval');
        setRIntervalSubMode(subMode);
      } else {
        setRMonthlyMode(subMode);
      }
    } else {
      setRType(r.schedule_type as any);
    }
    if (detail.time) setRTime(detail.time);
    if (r.schedule_type === 'once' && r.next_run_at) setRDate(r.next_run_at.split('T')[0]);
    if (detail.dayOfWeek) setRDay(detail.dayOfWeek);
    if (detail.dayOfMonth) setRDayOfMonth(detail.dayOfMonth);
    if (detail.nthWeek) setRNthWeek(detail.nthWeek);
    setRIntervalMonths(interval > 1 ? interval : 2);
    setRStartYear(Number(detail.startYear) || new Date().getFullYear());
    setRStartMonth(Number(detail.startMonth) || (new Date().getMonth() + 1));
    setIsReminderModalOpen(true);
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

  const TodoModal = () => {
    if (!isTodoModalOpen || !editingTodo) return null;
    const update = (key: keyof EditingTodo, val: any) => setEditingTodo({ ...editingTodo, [key]: val });
    const toggleMoRemind = (days: number) => {
       const m = editingTodo.mochi_reminders;
       if (m.includes(days)) update('mochi_reminders', m.filter(d => d !== days).sort((a,b)=>b-a));
       else update('mochi_reminders', [...m, days].sort((a,b)=>b-a));
    };
    const addFreeRemind = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
         const v = Number(e.currentTarget.value);
         if (!isNaN(v) && v > 0 && !editingTodo.mochi_reminders.includes(v)) {
           update('mochi_reminders', [...editingTodo.mochi_reminders, v].sort((a,b)=>b-a));
         }
         e.currentTarget.value = '';
      }
    };

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', paddingTop: '8vh', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <div className="animate-slide-up" style={{ background: 'white', width: '90%', maxWidth: '440px', maxHeight: '85vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={20} color="#9370db" /> {editingTodo.id ? 'Taskの編集' : '新しいTask'}
            </h3>
            <button onClick={() => setIsTodoModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={22} /></button>
          </div>
          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>タイトル</label>
              <input value={editingTodo.title} onChange={e => update('title', e.target.value)} placeholder={editingTodo.parent_id ? "小タスク名" : "タスク名"} autoFocus
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>メモ</label>
              <textarea value={editingTodo.description} onChange={e => update('description', e.target.value)} placeholder="詳細内容など（任意）"
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.85rem', minHeight: '80px', resize: 'vertical', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>担当</label>
                <select value={editingTodo.assignee} onChange={e => update('assignee', e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', background: 'white' }}>
                  <option value="both">2人</option><option value="user_a">ミルク</option><option value="user_b">メリー</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>期限</label>
                <input type="date" value={editingTodo.due_date} onChange={e => update('due_date', e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }} />
              </div>
            </div>
            {editingTodo.id && (
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>ステータス</label>
                <select value={editingTodo.status} onChange={e => update('status', e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', background: STATUS[editingTodo.status as keyof typeof STATUS]?.bg, color: STATUS[editingTodo.status as keyof typeof STATUS]?.color, fontWeight: 700 }}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            )}
            
            {/* もちリマインド */}
            {editingTodo.due_date && (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  ⚪️ もちリマインド
                </label>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '12px' }}>期限の〇日前に、もちがチャットでお知らせするもち！</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {[1, 3, 7].map(d => (
                    <button type="button" key={d} onClick={(e) => { e.preventDefault(); toggleMoRemind(d); }} style={{
                      padding: '8px 14px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid',
                      borderColor: editingTodo.mochi_reminders.includes(d) ? '#9370db' : '#cbd5e1',
                      background: editingTodo.mochi_reminders.includes(d) ? '#f0ebff' : 'white',
                      color: editingTodo.mochi_reminders.includes(d) ? '#9370db' : '#64748b', cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      {d}日前
                    </button>
                  ))}
                  {editingTodo.mochi_reminders.filter(d => ![1,3,7].includes(d)).map(d => (
                    <button type="button" key={d} onClick={(e) => { e.preventDefault(); toggleMoRemind(d); }} style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, border: '1px solid #9370db', background: '#f0ebff', color: '#9370db', cursor: 'pointer', transition: 'all 0.2s' }}>
                      {d}日前
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <input type="number" placeholder="日数" onKeyDown={addFreeRemind} min={1} style={{ width: '60px', padding: '6px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none' }} />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>日前を追加 (Enter)</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: 'white', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={() => setIsTodoModalOpen(false)} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>キャンセル</button>
            <button type="button" onClick={saveTodo} style={{ padding: '12px 28px', borderRadius: '12px', border: 'none', background: '#9370db', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(147, 112, 219, 0.3)' }}>保存</button>
          </div>
        </div>
      </div>
    );
  };

  const ReminderForm = ({ isEdit = false, targetId = undefined }: { isEdit?: boolean, targetId?: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <input value={rMsg} onChange={e => setRMsg(e.target.value)} placeholder="リマインダーの内容"
        autoFocus style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.95rem', background: 'white', outline: 'none' }} />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['once', 'daily', 'weekly', 'monthly'] as const).map(t => {
          let label = '';
          if (t === 'once') label = '1回';
          else if (t === 'daily') label = '毎日';
          else if (t === 'weekly') label = '毎週';
          else {
            // monthly ボタンのラベルは、 選択されているモードによって変わる
            if (rType === 'monthly') {
              if (rMonthlyMode === 'date') label = '毎月○日';
              else if (rMonthlyMode === 'nth') label = '毎月第○△曜日';
              else label = 'それ以上';
            } else {
              label = 'それ以上';
            }
          }
          return (
            <button type="button" key={t} onClick={(e) => {
              e.preventDefault();
              if (t === 'monthly') {
                // monthly ボタンは押すたびにサブモーダルが出る (= モード再選択)
                setRType('monthly');
                setMonthlyChooserOpen(true);
              } else {
                setRType(t);
              }
            }} style={{
              padding: '8px 16px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: rType === t ? '#9370db' : '#f1f5f9', color: rType === t ? 'white' : '#64748b', transition: '0.2s'
            }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {rType === 'once' && (
          <input type="date" value={rDate} onChange={e => setRDate(e.target.value)}
            style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }} />
        )}
        {rType === 'weekly' && (
          <select value={rDay} onChange={e => setRDay(Number(e.target.value))}
            style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
            {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}曜日</option>)}
          </select>
        )}

        {rType === 'monthly' && rMonthlyMode === 'date' && (
          <select value={rDayOfMonth} onChange={e => setRDayOfMonth(Number(e.target.value))}
            style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
            {Array.from({length: 31}, (_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
          </select>
        )}

        {rType === 'monthly' && rMonthlyMode === 'nth' && (
          <>
            <select value={rNthWeek} onChange={e => setRNthWeek(Number(e.target.value))}
              style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>第{n}</option>)}
            </select>
            <select value={rDay} onChange={e => setRDay(Number(e.target.value))}
              style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
              {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}曜</option>)}
            </select>
          </>
        )}

        {/* それ以上モード: 1 行目 = 開始年月 + 間隔, 2 行目 = 日にち/第N曜日 タブ */}
        {rType === 'monthly' && rMonthlyMode === 'interval' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
            {/* 1 行目: 開始年月 + Nヶ月に1回 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#475569' }}>
              <select value={rStartYear} onChange={e => setRStartYear(Number(e.target.value))}
                style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                {Array.from({length: 5}, (_, i) => {
                  const y = new Date().getFullYear() + i;
                  return <option key={y} value={y}>{y}年</option>;
                })}
              </select>
              <select value={rStartMonth} onChange={e => setRStartMonth(Number(e.target.value))}
                style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1}月</option>)}
              </select>
              <span>から</span>
              <input
                type="number" inputMode="numeric"
                min={2} max={120} step={1}
                value={rIntervalMonths}
                onChange={e => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setRIntervalMonths(Math.min(120, Math.max(2, Math.floor(n))));
                }}
                style={{ width: '72px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none', textAlign: 'center' }}
              />
              <span>ヶ月に1回</span>
            </div>

            {/* 2 行目: 日にち / 第N曜日 タブ */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'date' as const, label: '日にちを設定' },
                { id: 'nth' as const, label: '第○△曜日を設定' },
              ].map(opt => (
                <button
                  type="button" key={opt.id}
                  onClick={(e) => { e.preventDefault(); setRIntervalSubMode(opt.id); }}
                  style={{
                    flex: 1,
                    padding: '10px', borderRadius: '12px',
                    fontSize: '0.85rem', fontWeight: 600,
                    border: rIntervalSubMode === opt.id ? '2px solid #9370db' : '1px solid #e2e8f0',
                    background: rIntervalSubMode === opt.id ? '#f3eafe' : 'white',
                    color: rIntervalSubMode === opt.id ? '#6d49c8' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 3 行目: サブモードに応じた入力 */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {rIntervalSubMode === 'date' ? (
                <select value={rDayOfMonth} onChange={e => setRDayOfMonth(Number(e.target.value))}
                  style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                  {Array.from({length: 31}, (_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                </select>
              ) : (
                <>
                  <select value={rNthWeek} onChange={e => setRNthWeek(Number(e.target.value))}
                    style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>第{n}</option>)}
                  </select>
                  <select value={rDay} onChange={e => setRDay(Number(e.target.value))}
                    style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }}>
                    {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAYS[d]}曜</option>)}
                  </select>
                </>
              )}
              <input type="time" value={rTime} onChange={e => setRTime(e.target.value)}
                style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }} />
            </div>
          </div>
        )}

        {/* それ以上モード以外は時間入力をこの行に */}
        {!(rType === 'monthly' && rMonthlyMode === 'interval') && (
          <input type="time" value={rTime} onChange={e => setRTime(e.target.value)}
            style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', outline: 'none' }} />
        )}
      </div>

      <div style={{ padding: '8px 0', borderTop: '1px solid #e2e8f0', marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button type="button" onClick={() => { setIsReminderModalOpen(false); setEditReminderId(null); }} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>キャンセル</button>
        <button type="button" onClick={() => saveReminder(targetId)} style={{ padding: '12px 28px', borderRadius: '12px', border: 'none', background: '#9370db', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(147, 112, 219, 0.3)' }}>{isEdit ? '保存' : '追加'}</button>
      </div>
    </div>
  );

  const MonthlyChooserOverlay = () => {
    if (!monthlyChooserOpen) return null;
    const choose = (mode: 'date' | 'nth' | 'interval') => {
      setRMonthlyMode(mode);
      if (mode === 'interval' && rIntervalMonths < 2) setRIntervalMonths(2);
      setMonthlyChooserOpen(false);
    };
    return (
      <div
        onClick={() => setMonthlyChooserOpen(false)}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="animate-slide-up"
          style={{ background: 'white', width: '88%', maxWidth: '380px', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}
        >
          <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b', fontWeight: 700 }}>どの繰り返し方にする？</h4>
          {[
            { id: 'date' as const, label: '毎月○日' },
            { id: 'nth' as const, label: '毎月第○△曜日' },
            { id: 'interval' as const, label: 'それ以上' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              style={{
                textAlign: 'center',
                padding: '14px 16px', borderRadius: '14px',
                border: rMonthlyMode === opt.id ? '2px solid #9370db' : '1px solid #e2e8f0',
                background: rMonthlyMode === opt.id ? '#f3eafe' : 'white',
                cursor: 'pointer',
                fontSize: '1rem', fontWeight: 700, color: '#1e293b',
              }}
            >
              {opt.label}
            </button>
          ))}
          <button type="button" onClick={() => setMonthlyChooserOpen(false)} style={{ marginTop: '4px', padding: '10px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>キャンセル</button>
        </div>
      </div>
    );
  };

  const ReminderModal = () => {
    if (!isReminderModalOpen) return null;
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', paddingTop: '8vh', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <div className="animate-slide-up" style={{ background: 'white', width: '90%', maxWidth: '440px', maxHeight: '85vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={20} color="#9370db" /> {editReminderId ? 'リマインダー編集' : '新しいリマインダー'}
            </h3>
            <button onClick={() => { setIsReminderModalOpen(false); setEditReminderId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={22} /></button>
          </div>
          <div style={{ padding: '24px', overflowY: 'auto' }}>
            {ReminderForm({ isEdit: !!editReminderId, targetId: editReminderId || undefined })}
          </div>
        </div>
        <MonthlyChooserOverlay />
      </div>
    );
  };

  const TaskCard = ({ todo, isChild = false }: { todo: Todo; isChild?: boolean }) => {
    const isDone = todo.status === 'done';
    const kids = children(todo.id);
    const isOpen = expanded.has(todo.id);
    const prog = progress(todo.id);
    const st = STATUS[todo.status as keyof typeof STATUS] || STATUS.not_started;
    const overdue = todo.due_date && !isDone && new Date(todo.due_date) < new Date(new Date().toDateString());
    const assigneeLabel = todo.assignee === 'user_a' ? 'ミルク' : todo.assignee === 'user_b' ? 'メリー' : '2人';
    const dueDateLabel = todo.due_date ? new Date(todo.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '期限なし';

    let urgencyBadge: { label: string; color: string; bg: string } | null = null;
    if (todo.due_date && !isDone) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(todo.due_date); due.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

      if (diffDays < 0) {
        urgencyBadge = { label: '期限超過', color: '#fff', bg: '#dc2626' };
      } else if (diffDays === 0) {
        urgencyBadge = { label: '今日中', color: '#fff', bg: '#ea580c' };
      } else if (due <= endOfWeek) {
        urgencyBadge = { label: '今週中', color: '#9370db', bg: '#f0ebff' };
      }
    }

    return (
      <div>
        <div style={{
          padding: '14px 16px', marginLeft: isChild ? '20px' : 0,
          borderLeft: isChild ? '3px solid #e2e8f0' : 'none',
          background: isDone ? 'rgba(248,250,252,0.8)' : 'rgba(255,255,255,0.85)',
          borderRadius: isChild ? '0 14px 14px 0' : '16px',
          marginBottom: '8px', border: isChild ? 'none' : '1px solid rgba(0,0,0,0.06)',
          opacity: isDone ? 0.5 : 1, boxShadow: isChild ? 'none' : '0 2px 6px rgba(0,0,0,0.03)',
        }}>
          {/* Row 1 (top): meta chips + delete */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            {!isChild && kids.length > 0 ? (
              <button onClick={() => { const n = new Set(expanded); isOpen ? n.delete(todo.id) : n.add(todo.id); setExpanded(n); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', flexShrink: 0 }}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : !isChild ? <div style={{ width: 16 }} /> : null}

            {!isChild && (
              <button onClick={() => { openTodoModal(undefined, todo.id); setExpanded(prev => new Set(prev).add(todo.id)); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0, display: 'flex', flexShrink: 0 }} title="小タスク追加">
                <Plus size={15} />
              </button>
            )}

            <span onClick={() => openTodoModal(todo)} style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '8px', background: '#f8fafc', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
              {assigneeLabel}
            </span>
            <span onClick={() => openTodoModal(todo)} style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '8px', background: overdue ? '#fef2f2' : '#f8fafc', color: overdue ? '#dc2626' : '#64748b', fontWeight: 600, cursor: 'pointer' }}>
              {dueDateLabel}
            </span>
            <select value={todo.status} onChange={e => setStatus(todo.id, e.target.value)}
              style={{ fontSize: '0.68rem', padding: '3px 8px', borderRadius: '8px', border: 'none', background: st.bg, color: st.color, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {urgencyBadge && (
              <span style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '8px', background: urgencyBadge.bg, color: urgencyBadge.color, fontWeight: 700 }}>
                {urgencyBadge.label}
              </span>
            )}
            {todo.mochi_reminders && todo.mochi_reminders.length > 0 && (
              <span style={{ fontSize: '0.65rem', padding: '3px 6px', borderRadius: '8px', background: '#f0ebff', color: '#9370db', fontWeight: 700 }}>
                ⚪️
              </span>
            )}

            <div style={{ flex: 1 }} />

            {prog && (
              <div style={{ width: '40px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${(prog.done / prog.total) * 100}%`, background: '#9370db', borderRadius: '3px', transition: 'width 0.3s' }} />
              </div>
            )}

            <button onClick={() => deleteTask(todo.id, todo.title)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 0, flexShrink: 0, marginLeft: '6px' }}>
              <Trash2 size={16} />
            </button>
          </div>

          {/* Row 2 (bottom): title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div onClick={() => openTodoModal(todo)}
              style={{ cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, color: isDone ? '#94a3b8' : 'var(--text-main)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4, flex: 1 }}>
              {todo.title}
              {todo.description && (
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5, textDecoration: 'none', whiteSpace: 'pre-wrap' }}>
                  {todo.description}
                </p>
              )}
            </div>
            <button onClick={() => openTodoModal(todo)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}>
              <Edit2 size={15} />
            </button>
          </div>
        </div>

        {/* Children */}
        {!isChild && isOpen && kids.map(c => <React.Fragment key={c.id}>{TaskCard({ todo: c, isChild: true })}</React.Fragment>)}
      </div>
    );
  };

  const ReminderCard = ({ r }: { r: Reminder }) => {
    const typeLabel = SCHEDULE_LABELS[r.schedule_type] || r.schedule_type;
    const detail = r.schedule_detail || {};
    const interval = Math.max(1, Number(detail.intervalMonths) || 1);
    const monthlyPrefix = interval > 1 ? `${interval}ヶ月に1回` : '毎月';
    let scheduleDesc = typeLabel;
    if (r.schedule_type === 'weekly' && detail.dayOfWeek) scheduleDesc += DAYS[detail.dayOfWeek] + '曜';
    if (r.schedule_type === 'monthly_date' && detail.dayOfMonth) scheduleDesc = `${monthlyPrefix}${detail.dayOfMonth}日`;
    if (r.schedule_type === 'monthly_nth') scheduleDesc = `${monthlyPrefix}第${detail.nthWeek}${DAYS[detail.dayOfWeek] || ''}曜`;
    if (detail.time) scheduleDesc += ' ' + detail.time;

    return (
      <div style={{
        padding: '16px', background: r.is_active ? 'rgba(255,255,255,0.85)' : 'rgba(248,250,252,0.7)',
        borderRadius: '16px', marginBottom: '8px', border: '1px solid rgba(0,0,0,0.06)',
        opacity: r.is_active ? 1 : 0.5, boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => toggleReminder(r.id, r.is_active)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: r.is_active ? '#9370db' : '#cbd5e1', padding: 0, flexShrink: 0 }}>
            {r.is_active ? <Bell size={20} /> : <BellOff size={20} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div onClick={() => startEditReminder(r)} style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{r.message}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: '#f0ebff', color: '#9370db', padding: '2px 10px', borderRadius: '8px', fontWeight: 600 }}>{scheduleDesc}</span>
              <span>次回: {new Date(r.next_run_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              {r.created_by && <span>{r.created_by === 'user_a' ? 'ミルク' : 'メリー'}</span>}
            </div>
          </div>
          <button onClick={() => startEditReminder(r)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}>
            <Edit2 size={16} />
          </button>
          <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 0, flexShrink: 0, marginLeft: '6px' }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  if (!myProfile) return null;

  const tabs = [
    { id: 'tasks' as const, label: 'Task', count: taskTabItems.length },
    { id: 'reminders' as const, label: 'リマインダー', count: reminders.filter(r => r.is_active).length },
    { id: 'done' as const, label: '完了Task', count: doneTasks.length },
  ];

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)' }}>
      {TodoModal()}
      {ReminderModal()}
      
      {/* Header */}
      <div style={{ padding: '16px 20px', background: 'var(--glass-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.5px' }}>TODO / リマインダー</h1>
        <button onClick={() => { tab === 'reminders' ? (() => {
            setIsReminderModalOpen(true);
            setEditReminderId(null);
            setRMsg('');
            setRType('daily');
            setRMonthlyMode('date');
            setRIntervalSubMode('date');
            setRIntervalMonths(2);
            setRDayOfMonth(1);
            setRNthWeek(1);
            setRDay(1);
            setRTime('09:00');
            setRDate('');
            setRStartYear(new Date().getFullYear());
            setRStartMonth(new Date().getMonth() + 1);
          })() : openTodoModal(); }}
          style={{ background: '#9370db', color: 'white', padding: '8px 16px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(147, 112, 219, 0.3)' }}>
          <Plus size={16} /> {tab === 'reminders' ? 'リマインダー' : 'Task'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', background: 'var(--glass-bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '14px 0', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid #9370db' : '2px solid transparent',
            color: tab === t.id ? '#9370db' : '#94a3b8', fontWeight: tab === t.id ? 800 : 600,
            fontSize: '0.85rem', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
          }}>
            {t.label}
            {t.count > 0 && <span style={{ fontSize: '0.7rem', background: tab === t.id ? '#f0ebff' : '#f1f5f9', color: tab === t.id ? '#9370db' : '#94a3b8', padding: '2px 8px', borderRadius: '8px', fontWeight: 800 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* ===== Tasks Tab ===== */}
        {tab === 'tasks' && (
          taskTabItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>タスクがありません</p>
              <p style={{ fontSize: '0.8rem' }}>右上の「＋Task」から追加</p>
            </div>
          ) : taskTabItems.map(t => <React.Fragment key={t.id}>{TaskCard({ todo: t })}</React.Fragment>)
        )}

        {/* ===== Reminders Tab ===== */}
        {tab === 'reminders' && (
          reminders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>リマインダーがありません</p>
              <p style={{ fontSize: '0.8rem' }}>右上の「＋リマインダー」から追加</p>
            </div>
          ) : reminders.map(r => <React.Fragment key={r.id}>{ReminderCard({ r })}</React.Fragment>)
        )}

        {/* ===== Done Tab ===== */}
        {tab === 'done' && (
          doneTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>完了したタスクはありません</p>
            </div>
          ) : doneTasks.map(t => <React.Fragment key={t.id}>{TaskCard({ todo: t })}</React.Fragment>)
        )}
      </div>
    </div>
  );
}
