import React, { useState, useEffect } from 'react';
import { X, Save, Clock, Trash2 } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

type Reminder = {
  id: string;
  message: string;
  schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'monthly_date' | 'monthly_nth';
  schedule_detail: any;
  next_run_at: string;
  is_active: boolean;
  created_by?: string;
};

export default function ReminderModal({ onClose }: { onClose: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create'>('list');
  
  // フォームステート
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [date, setDate] = useState(''); // YYYY-MM-DD
  const [time, setTime] = useState(''); // HH:MM
  const [dayOfWeek, setDayOfWeek] = useState(1); // 1:Mon - 7:Sun
  
  // 月毎の詳細設定用
  const [monthlyMode, setMonthlyMode] = useState<'date' | 'nth'>('date');
  const [dayOfMonth, setDayOfMonth] = useState(1); // 1-31
  const [nthWeek, setNthWeek] = useState(1); // 1-5

  useEffect(() => {
    fetchReminders();
  }, []);

  const postMochiMessage = async (action: string, reminderMessage: string) => {
    // ユーザー名判定（本来はDBから引くかPropsで渡すが、手っ取り早くlocalStorageを使用）
    const profile = localStorage.getItem('boshi_profile');
    const name = profile === 'user_a' ? 'ミルク' : (profile === 'user_b' ? 'メリー' : '誰か');
    const text = `${name}さんが「${reminderMessage}」のリマインダーを${action}しました。`;
    
    await supabase.from('messages').insert([{ text, user_id: 'mochi' }]);
    
    // プッシュ通知も併せて送信（操作した本人には鳴らさず、相手にだけ鳴らす）
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: "BOSHI×BOSHI Talk (もち)",
        body: text,
        senderUserId: profile // 本人を通知先から除外
      })
    }).catch(e => console.error(e));
  };

  const fetchReminders = async () => {
    setLoading(true);
    const { data } = await supabase.from('scheduled_reminders').select('*').order('created_at', { ascending: false });
    if (data) setReminders(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!message || !time) return alert("メッセージと時間は必須です");
    if (type === 'once' && !date) return alert("実行日を入力してください");

    let nextRun = new Date();
    let finalType = type as string;
    let detailParams: any = { time };

    if (type === 'once') {
       nextRun = new Date(`${date}T${time}:00`);
    } else {
       const [h, m] = time.split(':').map(Number);
       nextRun.setHours(h, m, 0, 0);
       
       if (nextRun <= new Date()) {
         nextRun.setDate(nextRun.getDate() + 1); // 次の日に
       }
       
       if (type === 'weekly') {
          detailParams.dayOfWeek = dayOfWeek;
          // 該当曜日になるまで進める（0:Sun ~ 6:Sat -> 1:Mon ~ 7:Sun合わせ）
          const jsDay = dayOfWeek === 7 ? 0 : dayOfWeek;
          while (nextRun.getDay() !== jsDay) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
       } else if (type === 'monthly') {
          if (monthlyMode === 'date') {
            finalType = 'monthly_date';
            detailParams.dayOfMonth = dayOfMonth;
            let tempDate = new Date();
            tempDate.setHours(h, m, 0, 0);
            
            // 月の末日を超えないように調整
            const currentMonthDays = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 0).getDate();
            const targetDay = Math.min(dayOfMonth, currentMonthDays);
            tempDate.setDate(targetDay);
            
            if (tempDate <= new Date()) {
              // 来月へ
              tempDate.setMonth(tempDate.getMonth() + 1);
              const nextMonthDays = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 0).getDate();
              tempDate.setDate(Math.min(dayOfMonth, nextMonthDays));
            }
            nextRun = tempDate;
            
          } else {
            finalType = 'monthly_nth';
            detailParams.nthWeek = nthWeek;
            detailParams.dayOfWeek = dayOfWeek;
            
            // 今月の第N曜日を計算
            const jsDay = dayOfWeek === 7 ? 0 : dayOfWeek;
            let tempDate = new Date(nextRun.getFullYear(), nextRun.getMonth(), 1, h, m, 0);
            let count = 0;
            while (tempDate.getMonth() === nextRun.getMonth()) {
              if (tempDate.getDay() === jsDay) {
                count++;
                if (count === nthWeek) break;
              }
              tempDate.setDate(tempDate.getDate() + 1);
            }
            
            if (tempDate <= new Date() || tempDate.getMonth() !== nextRun.getMonth() || count !== nthWeek) {
              // 来月へ
              tempDate = new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 1, h, m, 0);
              count = 0;
              while (true) {
                if (tempDate.getDay() === jsDay) {
                  count++;
                  if (count === nthWeek) break;
                }
                tempDate.setDate(tempDate.getDate() + 1);
              }
            }
            nextRun = tempDate;
          }
       }
    }

    const profile = localStorage.getItem('boshi_profile');
    const { error } = await supabase.from('scheduled_reminders').insert([{
      message,
      schedule_type: finalType,
      schedule_detail: detailParams,
      next_run_at: nextRun.toISOString(),
      is_active: true,
      created_by: profile || 'unknown'
    }]);

    if (!error) {
      alert("設定しました！");
      postMochiMessage("追加", message);
      setMessage('');
      setView('list');
      fetchReminders();
    } else {
      alert("エラーが発生しました: " + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    const target = reminders.find(r => r.id === id);
    await supabase.from('scheduled_reminders').delete().eq('id', id);
    if (target) postMochiMessage("削除", target.message);
    fetchReminders();
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    const target = reminders.find(r => r.id === id);
    await supabase.from('scheduled_reminders').update({ is_active: !currentStatus }).eq('id', id);
    if (target) postMochiMessage(!currentStatus ? "再開" : "停止", target.message);
    fetchReminders();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="animate-slide-up" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', width: '90%', maxWidth: '400px', maxHeight: '80vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.5)' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} color="var(--primary)" /> リマインダ設定
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {view === 'list' && (
            <div>
              <button 
                onClick={() => setView('create')} 
                  style={{ width: '100%', padding: '12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '16px' }}
                >
                  + 新しいリマインダを追加
                </button>

              {loading ? <p style={{textAlign:'center', color:'var(--text-muted)'}}>読み込み中...</p> : reminders.length === 0 ? <p style={{textAlign:'center', color:'var(--text-muted)'}}>設定はありません</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reminders.map(r => (
                    <div key={r.id} style={{ border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '16px', background: 'white', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: r.is_active ? 1 : 0.6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                            {r.schedule_type === 'once' ? '単発' : 
                             r.schedule_type === 'daily' ? '毎日' : 
                             r.schedule_type === 'weekly' ? '毎週' : 
                             r.schedule_type === 'monthly_date' ? `毎月${r.schedule_detail?.dayOfMonth}日` : 
                             r.schedule_type === 'monthly_nth' ? `毎月第${r.schedule_detail?.nthWeek}` : 
                             '毎月'}
                          </span>
                          {r.created_by && (
                            <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {r.created_by === 'user_a' ? '👩‍🦰 ミルク設定' : r.created_by === 'user_b' ? '👦 メリー設定' : '⚙️ システム'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '4px' }}>{r.message}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>次回: {new Date(r.next_run_at).toLocaleString('ja-JP')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                         <button onClick={() => handleToggle(r.id, r.is_active)} style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '8px', border: 'none', background: r.is_active ? '#e2e8f0' : 'var(--primary)', color: r.is_active ? 'black' : 'white', cursor: 'pointer' }}>
                           {r.is_active ? '停止' : '再開'}
                         </button>
                         <button onClick={() => handleDelete(r.id)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer' }}>
                           <Trash2 size={16} />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <div>
                 <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>繰り返し</label>
                 <select value={type} onChange={e => setType(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }}>
                   <option value="once">1回のみ</option>
                   <option value="daily">毎日</option>
                   <option value="weekly">毎週</option>
                   <option value="monthly">毎月</option>
                 </select>
               </div>

               {type === 'once' && (
                 <div>
                   <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>日付</label>
                   <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }} />
                 </div>
               )}

               {type === 'weekly' && (
                 <div>
                   <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>曜日</label>
                   <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }}>
                     <option value={1}>月曜日</option>
                     <option value={2}>火曜日</option>
                     <option value={3}>水曜日</option>
                     <option value={4}>木曜日</option>
                     <option value={5}>金曜日</option>
                     <option value={6}>土曜日</option>
                     <option value={7}>日曜日</option>
                   </select>
                 </div>
               )}

               {type === 'monthly' && (
                 <div style={{ display: 'flex', gap: '8px' }}>
                   <div style={{ flex: 1 }}>
                     <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>指定方法</label>
                     <select 
                       value={monthlyMode === 'date' ? 'date' : nthWeek.toString()} 
                       onChange={e => {
                         if (e.target.value === 'date') {
                           setMonthlyMode('date');
                         } else {
                           setMonthlyMode('nth');
                           setNthWeek(Number(e.target.value));
                         }
                       }} 
                       style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }}
                     >
                       <option value="date">毎月●日</option>
                       <option value="1">第1</option>
                       <option value="2">第2</option>
                       <option value="3">第3</option>
                       <option value="4">第4</option>
                       <option value="5">第5</option>
                     </select>
                   </div>
                   <div style={{ flex: 1 }}>
                     {monthlyMode === 'date' ? (
                       <>
                         <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>日にち</label>
                         <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }}>
                           {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                             <option key={d} value={d}>{d}日</option>
                           ))}
                         </select>
                       </>
                     ) : (
                       <>
                         <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>曜日</label>
                         <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }}>
                           <option value={1}>月曜日</option>
                           <option value={2}>火曜日</option>
                           <option value={3}>水曜日</option>
                           <option value={4}>木曜日</option>
                           <option value={5}>金曜日</option>
                           <option value={6}>土曜日</option>
                           <option value={7}>日曜日</option>
                         </select>
                       </>
                     )}
                   </div>
                 </div>
               )}

               <div>
                 <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>時間</label>
                 <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white' }} />
               </div>

               <div>
                 <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>メッセージ</label>
                 <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="例: ゴミの日です！" style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'white', resize: 'none' }} />
               </div>

               <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                 <button onClick={() => setView('list')} style={{ flex: 1, padding: '12px', background: '#e2e8f0', color: 'var(--text-main)', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>キャンセル</button>
                 <button onClick={handleSave} style={{ flex: 1, padding: '12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Save size={18} /> 登録する</button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
