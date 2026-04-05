"use client";

import React, { useState, useEffect } from 'react';
import { X, Save, Bot } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

type Props = {
  onClose: () => void;
};

export default function MochiSettingsModal({ onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPrompt();
  }, []);

  const fetchPrompt = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('couple_settings').select('mochi_prompt').limit(1).single();
    if (data?.mochi_prompt) {
      setPrompt(data.mochi_prompt);
    } else {
      setPrompt(`あなたは「もち」というサポーターボットです。`);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await supabase.from('couple_settings').update({ mochi_prompt: prompt }).eq('id', (await supabase.from('couple_settings').select('id').single()).data?.id);
    setIsSaving(false);
    if (!error) {
      onClose();
    } else {
      alert("保存に失敗しました");
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div className="modal-content animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={24} />
            もち（AI）の設定
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', fontSize: '0.85rem', color: '#475569', border: '1px solid #e2e8f0' }}>
            <p>ここに「もち」の人格、知識、口調などの設定（システムプロンプト）を入力します。</p>
            <p style={{ marginTop: '8px', color: '#db2777', fontWeight: 'bold' }}>※APIキーの入力欄について</p>
            <p>APIキー（sk-proj...）は、セキュリティの観点から画面には保存しません。URLを知る第三者に盗まれるリスクを防ぐため、必ずVercelのEnvironment Variables（環境変数）に「OPENAI_API_KEY」として登録してください。</p>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>読み込み中...</div>
          ) : (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="あなたは〜として振る舞ってください。"
              style={{
                width: '100%',
                minHeight: '300px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                background: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                resize: 'vertical',
                color: 'var(--text-main)',
                fontFamily: 'monospace' // プロンプトエディタらしく
              }}
            />
          )}

          <button 
            className="primary-btn" 
            onClick={handleSave}
            disabled={isLoading || isSaving}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', fontWeight: 'bold' }}
          >
            <Save size={20} />
            {isSaving ? '保存中...' : '設定を保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
