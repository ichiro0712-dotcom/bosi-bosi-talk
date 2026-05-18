"use client";

import React, { useState, useEffect } from 'react';
import { Save, ChevronLeft, Bot, User, Heart, FileText, ScrollText, Copy, Sparkles } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import Link from 'next/link';

type CategoryFacts = {
  basic: string;
  personality: string;
  business: string;
  health: string;
  finance: string;
  hobbies: string;
  other: string;
};

type UserProfile = {
  id: number;
  user_id: string;
  display_name: string;
  facts: CategoryFacts;
  personality: string | null;
};

type Relationship = {
  id: number;
  vibe: string;
  vibe_reason: string | null;
};

type Summary = {
  id: number;
  summary: string;
  messages_from: number;
  messages_to: number;
  created_at: string;
};

type MemoryLog = {
  id: number;
  action: string;
  detail: any;
  created_at: string;
};

const vibeLabels: Record<string, string> = {
  lovey_dovey: 'ラブラブ',
  normal: '普通',
  tense: 'ちょっとピリピリ',
  excited: 'ワクワク',
  tired: 'お疲れ気味'
};

export default function MochiSettingsPage() {
  const [activeTab, setActiveTab] = useState<'capabilities' | 'character' | 'profiles' | 'vibe' | 'summaries' | 'log'>('capabilities');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // キャラ設定
  const [mochiPrompt, setMochiPrompt] = useState('');
  const [systemTemplates, setSystemTemplates] = useState({
    create: '{name}さんがTODO「{title}」を追加しました。',
    update: '{name}さんがTODO「{title}」を更新しました。',
    delete: '{name}さんがTODO「{title}」を削除しました。',
    status: '{name}さんがTODO「{title}」のステータスを「{status}」に変更しました。',
    bg_update: '{name}さんが、トップ画面の背景画像を変更しました！📸',
    anniv_create: '{name}さんが「つきあった日」を登録しました！💕',
    anniv_update: '{name}さんが「つきあった日」を変更しました！💕',
    anniv_delete: '{name}さんが「つきあった日」を削除しました！💔',
    reminder_add: '{name}さんがリマインダー「{title}」を追加しました。'
  });

  // ユーザープロファイル
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  // 関係性
  const [relationship, setRelationship] = useState<Relationship | null>(null);

  // サマリー
  const [summaries, setSummaries] = useState<Summary[]>([]);

  // ログ
  const [logs, setLogs] = useState<MemoryLog[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, profilesRes, vibeRes, summariesRes, logsRes] = await Promise.all([
        supabase.from('couple_settings').select('mochi_prompt, todo_templates').limit(1).single(),
        supabase.from('mochi_user_profiles').select('*').order('user_id'),
        supabase.from('mochi_relationship').select('*').limit(1).single(),
        supabase.from('mochi_conversation_summaries').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('mochi_memory_log').select('*').order('created_at', { ascending: false }).limit(30),
      ]);

      if (settingsRes.data) {
        if (settingsRes.data.mochi_prompt) setMochiPrompt(settingsRes.data.mochi_prompt);
        if (settingsRes.data.todo_templates) {
          setSystemTemplates(prev => ({ ...prev, ...settingsRes.data.todo_templates }));
        }
      }
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (vibeRes.data) setRelationship(vibeRes.data);
      if (summariesRes.data) setSummaries(summariesRes.data);
      if (logsRes.data) setLogs(logsRes.data);
    } catch (e) {
      console.error('Failed to load mochi settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async () => {
    setSaving(true);
    const { data } = await supabase.from('couple_settings').select('id').single();
    if (data) {
      await supabase.from('couple_settings').update({ mochi_prompt: mochiPrompt, todo_templates: systemTemplates }).eq('id', data.id);
    }
    setSaving(false);
    alert('保存しました');
  };

  const saveProfileFacts = async (userId: string, facts: CategoryFacts) => {
    await supabase.from('mochi_user_profiles')
      .update({ facts, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  };

  const updateCategoryText = (userId: string, category: keyof CategoryFacts, text: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.user_id === userId) {
        return { ...p, facts: { ...p.facts, [category]: text } };
      }
      return p;
    }));
  };

  const commitCategory = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    if (profile) saveProfileFacts(userId, profile.facts);
  };

  const saveVibe = async (vibe: string, reason: string) => {
    if (!relationship) return;
    setSaving(true);
    await supabase.from('mochi_relationship')
      .update({ vibe, vibe_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', relationship.id);
    setRelationship({ ...relationship, vibe, vibe_reason: reason });
    setSaving(false);
  };

  const tabs = [
    { id: 'capabilities' as const, label: 'できること', icon: Sparkles },
    { id: 'character' as const, label: 'キャラ設定', icon: Bot },
    { id: 'profiles' as const, label: 'ユーザー情報', icon: User },
    { id: 'vibe' as const, label: '関係性', icon: Heart },
    { id: 'summaries' as const, label: '会話サマリー', icon: ScrollText },
    { id: 'log' as const, label: '記憶ログ', icon: FileText },
  ];

  if (loading) return <div style={{ height: '100dvh', background: 'var(--bg-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>読み込み中...</div>;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/chat" style={{ color: 'var(--text-muted)', display: 'flex' }}>
          <ChevronLeft size={24} />
        </Link>
        <img src="/mochi.png" alt="mochi" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>もちAI設定</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)', padding: '0 8px', flexShrink: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              color: activeTab === tab.id ? '#9370db' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid #9370db' : '2px solid transparent',
              fontWeight: activeTab === tab.id ? 700 : 600, fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: '0.2s'
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 140px 20px' }}>

        {/* === できることタブ === */}
        {activeTab === 'capabilities' && <CapabilitiesTab />}

        {/* === キャラ設定タブ === */}
        {activeTab === 'character' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1, minWidth: '280px' }}>
                もちの性格・口調や、システムメッセージの定型文を設定します。ここで設定した内容は「保存」ボタンで一括保存されます。
              </div>
              <button onClick={savePrompt} disabled={saving} style={{
                background: '#9370db', color: 'white', padding: '12px 20px', borderRadius: '12px',
                fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 12px rgba(147,112,219,0.3)', border: 'none', cursor: 'pointer'
              }}>
                <Save size={18} />
                {saving ? '保存中...' : '設定を保存'}
              </button>
            </div>
            <textarea
              value={mochiPrompt}
              onChange={e => setMochiPrompt(e.target.value)}
              placeholder="あなたは「もち」として振る舞ってください..."
              style={{
                width: '100%', minHeight: '300px', padding: '14px', borderRadius: '12px',
                border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.6)',
                fontSize: '0.9rem', lineHeight: '1.6', resize: 'vertical', color: 'var(--text-main)', fontFamily: 'monospace'
              }}
            />

            <div style={{ marginTop: '16px', paddingTop: '24px', borderTop: '1px solid var(--glass-border)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#9370db" />
                定型メッセージ設定
              </h3>
              <div style={{ background: 'rgba(147,112,219,0.08)', padding: '12px', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                各種操作時にチャットへ送信されるメッセージです。{'{name}'}は操作した人、{'{title}'}は項目名、{'{status}'}はステータス名に置き換わります。<br/>
                ※ 上の「設定を保存」ボタンで一緒に保存されます。
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* TODO関連 */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #cbd5e1' }}>TODO関連</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>TODO 作成時</label>
                      <input value={systemTemplates.create} onChange={e => setSystemTemplates({...systemTemplates, create: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>TODO 更新時</label>
                      <input value={systemTemplates.update} onChange={e => setSystemTemplates({...systemTemplates, update: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>TODO 削除時</label>
                      <input value={systemTemplates.delete} onChange={e => setSystemTemplates({...systemTemplates, delete: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>TODO ステータス変更時</label>
                      <input value={systemTemplates.status} onChange={e => setSystemTemplates({...systemTemplates, status: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* 記念日関連 */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #cbd5e1' }}>記念日関連</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>記念日 登録時</label>
                      <input value={systemTemplates.anniv_create} onChange={e => setSystemTemplates({...systemTemplates, anniv_create: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>記念日 変更時</label>
                      <input value={systemTemplates.anniv_update} onChange={e => setSystemTemplates({...systemTemplates, anniv_update: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>記念日 削除時</label>
                      <input value={systemTemplates.anniv_delete} onChange={e => setSystemTemplates({...systemTemplates, anniv_delete: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* その他 */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #cbd5e1' }}>その他機能</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>トップ画面の背景変更時</label>
                      <input value={systemTemplates.bg_update} onChange={e => setSystemTemplates({...systemTemplates, bg_update: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>リマインダー 追加時</label>
                      <input value={systemTemplates.reminder_add} onChange={e => setSystemTemplates({...systemTemplates, reminder_add: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', outline: 'none' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === ユーザー情報タブ === */}
        {activeTab === 'profiles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              もちが覚えている情報です。カテゴリごとに自由に記入してください。会話中にもちが学習した内容も自動で追記されます。フォーカスを外すと自動保存されます。
            </div>

            {profiles.map(profile => (
              <div key={profile.user_id} style={{ background: 'rgba(255,255,255,0.7)', padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 20px', gap: '8px' }}>
                  <img src={profile.user_id === 'user_a' ? '/stamps/stamp_custom_7.png' : '/stamps/stamp_custom_8.png'} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', flex: 1 }}>
                    {profile.display_name}
                  </h3>
                  <button onClick={() => {
                    const cats = [
                      { key: 'basic', label: '基本情報' }, { key: 'personality', label: '性格・価値観' },
                      { key: 'business', label: '事業・仕事' }, { key: 'health', label: '健康・生活' },
                      { key: 'finance', label: 'お金' }, { key: 'hobbies', label: '趣味・興味' },
                      { key: 'other', label: 'その他' }
                    ];
                    const text = `【${profile.display_name}】\n\n` + cats
                      .filter(c => (profile.facts as any)[c.key]?.trim())
                      .map(c => `[${c.label}]\n${(profile.facts as any)[c.key].trim()}`)
                      .join('\n\n');
                    navigator.clipboard.writeText(text).then(() => alert('コピーしました'));
                  }} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '0.7rem', fontWeight: 600 }}>
                    <Copy size={13} /> コピー
                  </button>
                </div>

                {([
                  { key: 'basic' as const, label: '基本情報', icon: '📋', placeholder: '名前、年齢、居住地、経歴など' },
                  { key: 'personality' as const, label: '性格・価値観', icon: '🧠', placeholder: '思考スタイル、価値観、コミュニケーション傾向など' },
                  { key: 'business' as const, label: '事業・仕事', icon: '💼', placeholder: '職業、関与事業、スキル、構想など' },
                  { key: 'health' as const, label: '健康・生活', icon: '🏥', placeholder: '健康状態、生活習慣、サプリ、アレルギーなど' },
                  { key: 'finance' as const, label: 'お金', icon: '💰', placeholder: '収入、支出、資産、投資方針など' },
                  { key: 'hobbies' as const, label: '趣味・興味', icon: '🎵', placeholder: '好きなもの、趣味、興味のある分野など' },
                  { key: 'other' as const, label: 'その他', icon: '📝', placeholder: 'その他の情報' },
                ]).map(cat => (
                  <div key={cat.key} style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{cat.icon}</span> {cat.label}
                    </label>
                    <textarea
                      value={profile.facts[cat.key] || ''}
                      onChange={e => updateCategoryText(profile.user_id, cat.key, e.target.value)}
                      onBlur={() => commitCategory(profile.user_id)}
                      placeholder={cat.placeholder}
                      style={{
                        width: '100%', minHeight: profile.facts[cat.key] ? '100px' : '50px', padding: '10px 12px', borderRadius: '10px',
                        border: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.6)',
                        fontSize: '0.82rem', lineHeight: '1.55', resize: 'vertical', color: 'var(--text-main)'
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* === 関係性タブ === */}
        {activeTab === 'vibe' && relationship && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              もちが感じている2人の今の雰囲気です。会話の中でもちが自動更新しますが、手動でも変更できます。
            </div>

            <div style={{ background: 'rgba(255,255,255,0.7)', padding: '20px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>現在の雰囲気</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {Object.entries(vibeLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => saveVibe(key, relationship.vibe_reason || '')}
                    style={{
                      padding: '10px 18px', borderRadius: '20px', fontWeight: 600, fontSize: '0.85rem',
                      background: relationship.vibe === key ? '#9370db' : '#f1f5f9',
                      color: relationship.vibe === key ? 'white' : 'var(--text-main)',
                      border: 'none', cursor: 'pointer', transition: '0.2s'
                    }}
                  >{label}</button>
                ))}
              </div>

              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>理由メモ</label>
              <input
                value={relationship.vibe_reason || ''}
                onChange={e => setRelationship({ ...relationship, vibe_reason: e.target.value })}
                onBlur={() => saveVibe(relationship.vibe, relationship.vibe_reason || '')}
                placeholder="例: 最近忙しくてあまり会えていない"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                  background: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', color: 'var(--text-main)'
                }}
              />
            </div>
          </div>
        )}

        {/* === 会話サマリータブ === */}
        {activeTab === 'summaries' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              もちが過去の会話を自動で要約したものです。50件の会話ごとに圧縮されます。
            </div>

            {summaries.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>まだサマリーはありません（会話が50件を超えると自動生成されます）</p>
            ) : summaries.map(s => (
              <div key={s.id} style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '8px' }}>
                  メッセージ #{s.messages_from} 〜 #{s.messages_to} | {new Date(s.created_at).toLocaleString('ja-JP')}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0, lineHeight: '1.6' }}>{s.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* === 記憶ログタブ === */}
        {activeTab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              もちが自律的に行った記憶の更新履歴です。
            </div>

            {logs.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>まだログがありません</p>
            ) : logs.map(log => (
              <div key={log.id} style={{ background: 'rgba(255,255,255,0.7)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                    background: log.action === 'update_user_profile' ? '#dbeafe' : log.action === 'update_relationship_vibe' ? '#fce7f3' : '#f1f5f9',
                    color: log.action === 'update_user_profile' ? '#2563eb' : log.action === 'update_relationship_vibe' ? '#db2777' : '#64748b'
                  }}>
                    {log.action === 'update_user_profile' ? 'プロファイル更新' : log.action === 'update_relationship_vibe' ? 'Vibe更新' : log.action === 'compact_summary' ? 'サマリー圧縮' : log.action}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{new Date(log.created_at).toLocaleString('ja-JP')}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', margin: 0 }}>{JSON.stringify(log.detail)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// CapabilitiesTab: もちが「今できること」を非エンジニア向けに紹介するタブ
// 機能を追加したらここも更新する (CLAUDE.md にルール記載)
// =====================================================================

type CapabilityItem = {
  title: string;
  desc: string;
  examples: string[];
};

type CapabilityCategory = {
  name: string;
  emoji: string;
  color: string;
  items: CapabilityItem[];
};

const CAPABILITIES: CapabilityCategory[] = [
  {
    name: '日常のサポート',
    emoji: '📋',
    color: '#7c3aed',
    items: [
      {
        title: 'TODO の追加・整理',
        desc: '「○○やらなきゃ」と話しかけると TODO リストに追加。担当者や期限も指定できる。完了・遅れの状態も会話で更新できる。',
        examples: [
          '「明日までに引っ越し屋さんに連絡しなきゃ」',
          '「ジムの登録、もう終わったよ」',
          '「○○のタスク削除して」',
        ],
      },
      {
        title: 'リマインダーのセット',
        desc: '時間や曜日を指定すると、その時刻にプッシュ通知を送ってくれる。毎日・毎週の繰り返しも OK。',
        examples: [
          '「毎朝 7 時に水を飲むようリマインドして」',
          '「毎週月曜の朝にゴミ出し」',
          '「○○のリマインダー止めて」',
        ],
      },
      {
        title: '今日のご飯を提案',
        desc: 'メモに登録した「ご飯リスト」(🤖 マーク ON のメモ) の中から、栄養バランスや気分を考えて 3 案ほど提案。事前に「今日食べたもの」「気分・予算」を聞いてくれる。',
        examples: [
          '「今日のご飯どうしよう」',
          '「何食べる？」',
          '「ご飯提案して」',
        ],
      },
    ],
  },
  {
    name: '記憶と思い出し',
    emoji: '🧠',
    color: '#db2777',
    items: [
      {
        title: 'ミルク・メリーの情報を覚える',
        desc: '会話の中で新しくわかった事実 (好み、健康、仕事の話など) を自動でユーザー情報に追記。「ユーザー情報」タブで内容を確認・編集できる。',
        examples: [
          '「最近ジム通い始めたんだ」 → 健康カテゴリに自動記録',
          '「○○が好きなんだよね」 → 趣味カテゴリに自動記録',
        ],
      },
      {
        title: '過去の会話を検索 (古い会話も)',
        desc: 'ベクトル検索 + 全文検索のハイブリッドで、ずっと前に話した話題でも引っ張り出せる。「ジムの話」みたいな曖昧な言い方でも、意味が近い会話を拾ってくれる。',
        examples: [
          '「前に話したあのレストランどこだっけ」',
          '「ジムの話、いつしてた？」',
          '「○○さんの件、なんて言ってたっけ」',
        ],
      },
      {
        title: '2 人の関係性を見守る',
        desc: '会話の雰囲気から、2 人の関係性 (ラブラブ / 普通 / お疲れ気味など) を自動で判定して記録。「関係性」タブで確認できる。',
        examples: [
          '記念日の話で盛り上がる → ワクワクに更新',
          '忙しい話が続く → お疲れ気味に更新',
        ],
      },
    ],
  },
  {
    name: 'メモ・リスト管理',
    emoji: '📝',
    color: '#0891b2',
    items: [
      {
        title: 'メモの作成・更新・削除',
        desc: '会話の流れでメモに情報を書き溜められる。タイトル指定で既存メモへの追記もできる。',
        examples: [
          '「買い物リストに卵をメモして」',
          '「行きたい店リストに○○を追加」',
          '「○○メモ削除して」',
        ],
      },
      {
        title: '「もち用メモ」の活用',
        desc: 'メモ画面で 🤖 (もち用) を ON にすると、もちが提案や検索の時に参照する。ご飯リスト、行きたい店リストなど用途は自由。',
        examples: [
          'メモ「ご飯リスト」を作って 🤖 ON',
          '「今日のご飯提案して」と聞くと参照される',
        ],
      },
    ],
  },
  {
    name: '外部に頼む (Agent Hub)',
    emoji: '🌐',
    color: '#ea580c',
    items: [
      {
        title: 'お天気・ニュース・調べもの',
        desc: '一般的な情報の質問を Agent Hub という連携先 AI に依頼。長時間タスクはバックグラウンドで進み、結果が届くと自動で通知される。',
        examples: [
          '「今日の東京の天気教えて」',
          '「最新のニュースまとめて」',
          '「○○について調べて」',
        ],
      },
      {
        title: 'レストラン・ホテルの予約',
        desc: 'Agent Hub 経由で予約系のタスクを依頼。3-10 分かかる場合もあるが、完了したらチャットに通知が来る。途中でキャンセルも可能。',
        examples: [
          '「○○で和食のお店を予約して」',
          '「やっぱりキャンセル」',
        ],
      },
    ],
  },
];

function CapabilitiesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
        もちにできることの一覧です。 普段のチャットで自然に話しかければ、 もちが適切な機能を選んで動きます。
        新しいことを試したいときは下の例文を参考にしてみてください。
      </div>

      {CAPABILITIES.map((cat) => (
        <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{
            margin: 0, fontSize: '1rem', fontWeight: 700,
            color: cat.color, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '1.3rem' }}>{cat.emoji}</span> {cat.name}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {cat.items.map((item) => (
              <div
                key={item.title}
                style={{
                  background: 'rgba(255,255,255,0.75)',
                  padding: '16px', borderRadius: '14px',
                  border: '1px solid var(--glass-border)',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {item.title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  {item.desc}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: cat.color, marginBottom: '2px' }}>
                    こう話しかけてみて
                  </div>
                  {item.examples.map((ex, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '0.78rem', color: '#475569',
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.6)',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${cat.color}`,
                      }}
                    >
                      {ex}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        marginTop: '8px',
        background: 'rgba(255,237,213,0.5)', padding: '14px', borderRadius: '12px',
        fontSize: '0.75rem', color: '#92400e', lineHeight: '1.6',
      }}>
        💡 もちの機能を増やしたい / もちにこれもやって欲しい、 と思ったら開発者に伝えてください。
        新機能を追加した時はこのページも一緒に更新されます。
      </div>
    </div>
  );
}
