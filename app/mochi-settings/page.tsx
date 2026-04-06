"use client";

import React, { useState, useEffect } from 'react';
import { Save, ChevronLeft, Bot, User, Heart, FileText, ScrollText } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'character' | 'profiles' | 'vibe' | 'summaries' | 'log'>('character');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // キャラ設定
  const [mochiPrompt, setMochiPrompt] = useState('');

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
    const [settingsRes, profilesRes, vibeRes, summariesRes, logsRes] = await Promise.all([
      supabase.from('couple_settings').select('mochi_prompt').limit(1).single(),
      supabase.from('mochi_user_profiles').select('*').order('user_id'),
      supabase.from('mochi_relationship').select('*').limit(1).single(),
      supabase.from('mochi_conversation_summaries').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('mochi_memory_log').select('*').order('created_at', { ascending: false }).limit(30),
    ]);

    if (settingsRes.data?.mochi_prompt) setMochiPrompt(settingsRes.data.mochi_prompt);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (vibeRes.data) setRelationship(vibeRes.data);
    if (summariesRes.data) setSummaries(summariesRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    setLoading(false);
  };

  const savePrompt = async () => {
    setSaving(true);
    const { data } = await supabase.from('couple_settings').select('id').single();
    if (data) {
      await supabase.from('couple_settings').update({ mochi_prompt: mochiPrompt }).eq('id', data.id);
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* === キャラ設定タブ === */}
        {activeTab === 'character' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(147,112,219,0.08)', padding: '14px', borderRadius: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              もちの性格・口調・知識などを自由に設定できます。ここに書いた内容がSystem Promptとして使われます。
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
            <button onClick={savePrompt} disabled={saving} style={{
              background: '#9370db', color: 'white', padding: '14px', borderRadius: '12px',
              fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
              <Save size={18} />
              {saving ? '保存中...' : 'キャラ設定を保存'}
            </button>
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
                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img src={profile.user_id === 'user_a' ? '/stamps/stamp_custom_7.png' : '/stamps/stamp_custom_8.png'} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                  {profile.display_name}
                </h3>

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
