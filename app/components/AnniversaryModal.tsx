"use client";

import React, { useState, useEffect } from 'react';
import { X, Heart, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

type OtherAnniv = { id: string, title: string, date: string };

export default function AnniversaryModal({ onClose }: { onClose: () => void }) {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [anniversaryDate, setAnniversaryDate] = useState<string>('');
  const [otherAnnivs, setOtherAnnivs] = useState<OtherAnniv[]>([]);
  const [originalAnnivDate, setOriginalAnnivDate] = useState<string>('');
  const [originalOtherAnnivs, setOriginalOtherAnnivs] = useState<OtherAnniv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('couple_settings').select('*').limit(1).single();
    if (data) {
      setSettingsId(data.id);
      if (data.anniversary_date) {
        setAnniversaryDate(data.anniversary_date);
        setOriginalAnnivDate(data.anniversary_date);
      }
      if (data.other_anniversaries) {
        setOtherAnnivs(data.other_anniversaries);
        setOriginalOtherAnnivs(data.other_anniversaries);
      }
    }
    setLoading(false);
  };

  const addOther = () => {
    setOtherAnnivs([...otherAnnivs, { id: Date.now().toString(), title: '', date: '' }]);
  };

  const removeOther = (id: string) => {
    setOtherAnnivs(otherAnnivs.filter(a => a.id !== id));
  };

  const updateOther = (id: string, key: 'title' | 'date', val: string) => {
    setOtherAnnivs(otherAnnivs.map(a => a.id === id ? { ...a, [key]: val } : a));
  };

  const handleSave = async () => {
    const validOthers = otherAnnivs.filter(a => a.title && a.date);
    const payload = {
      anniversary_date: anniversaryDate || null,
      other_anniversaries: validOthers // 空のものは弾く
    };

    if (settingsId) {
      await supabase.from('couple_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('couple_settings').insert([payload]).select().single();
      if (data) setSettingsId(data.id);
    }

    // 差分検知して通知する
    const profile = localStorage.getItem('boshi_profile');
    const userName = profile === 'user_a' ? 'ミルク' : profile === 'user_b' ? 'メリー' : '誰か';
    let messages: string[] = [];

    if (originalAnnivDate !== anniversaryDate) {
      if (!originalAnnivDate && anniversaryDate) messages.push(`${userName}さんが「つきあった日」を登録しました！💕`);
      else if (originalAnnivDate && anniversaryDate) messages.push(`${userName}さんが「つきあった日」を変更しました！💕`);
      else messages.push(`${userName}さんが「つきあった日」を削除しました！💔`);
    }

    validOthers.forEach(newItem => {
       const oldItem = originalOtherAnnivs.find(o => o.id === newItem.id);
       if (!oldItem) {
          messages.push(`${userName}さんが記念日「${newItem.title}」を追加しました！🎉`);
       } else if (oldItem.title !== newItem.title || oldItem.date !== newItem.date) {
          messages.push(`${userName}さんが記念日「${newItem.title}」を変更しました！📝`);
       }
    });

    originalOtherAnnivs.forEach(oldItem => {
       const stillExists = validOthers.find(n => n.id === oldItem.id);
       if (!stillExists) {
          messages.push(`${userName}さんが記念日「${oldItem.title}」を削除しました！🗑️`);
       }
    });

    if (messages.length > 0) {
      const combinedMessage = messages.join('\n');
      await supabase.from('messages').insert([{
        text: combinedMessage,
        user_id: 'mochi'
      }]);
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: "もち ⚪️",
            body: combinedMessage,
            senderUserId: profile
          })
        });
      } catch (e) {}
    }

    alert("記念日を保存しました！");
    onClose();
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div className="animate-slide-up" style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', width: '90%', maxWidth: '400px', maxHeight: '85vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.5)' }}>
          <h3 style={{ margin: 0, color: '#e11d48', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Heart size={20} color="#e11d48" /> 記念日設定
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main Anniversary */}
          <div style={{ background: 'rgba(255,255,255,0.6)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(225, 29, 72, 0.2)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', textAlign: 'center', margin: '0 0 12px 0', fontWeight: 600 }}>
              💕 つきあった日（交際開始日）
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px', lineHeight: 1.4 }}>
              ※TOP画面のカウンターに表示されます
            </p>
            <input 
              type="date" 
              value={anniversaryDate} 
              onChange={e => setAnniversaryDate(e.target.value)} 
              style={{ 
                width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', 
                background: 'white', outline: 'none', fontSize: '1.1rem', textAlign: 'center', fontWeight: 'bold'
              }} 
            />
          </div>

          {/* Other Anniversaries */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>その他の記念日</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {otherAnnivs.map(anniv => (
                <div key={anniv.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="タイトル（例: ミルクの誕生日）" 
                      value={anniv.title}
                      onChange={e => updateOther(anniv.id, 'title', e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.85rem' }} 
                    />
                    <input 
                      type="date" 
                      value={anniv.date}
                      onChange={e => updateOther(anniv.id, 'date', e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.85rem' }} 
                    />
                  </div>
                  <button onClick={() => removeOther(anniv.id)} style={{ padding: '8px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button 
              onClick={addOther}
              style={{ 
                width: '100%', padding: '12px', background: 'transparent', color: 'var(--primary)', 
                border: '1px dashed var(--primary)', borderRadius: '12px', fontWeight: 'bold', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                marginTop: '12px'
              }}
            >
              <Plus size={16} /> イベントを追加
            </button>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.8)', borderTop: '1px solid var(--glass-border)' }}>
          <button 
            onClick={handleSave} 
            disabled={loading}
            style={{ 
              width: '100%', padding: '16px', background: '#e11d48', color: 'white', border: 'none', 
              borderRadius: '16px', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)'
            }}
          >
            <Save size={18} /> 全て保存する
          </button>
        </div>
      </div>
    </div>
  );
}
