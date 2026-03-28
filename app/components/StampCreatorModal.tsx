"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Wand2, Type, Check, Loader2 } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';

export default function StampCreatorModal({ onClose, onSave }: { onClose: () => void, onSave: (base64: string) => void }) {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [transparentImage, setTransparentImage] = useState<string | null>(null);
  const [stampText, setStampText] = useState("Vibe!");
  const [errorMsg, setErrorMsg] = useState("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    const url = URL.createObjectURL(file);
    setOriginalImage(url);
    setStep(2);
  };

  const handleRemoveBackground = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setErrorMsg("");
    
    try {
      const blob = await fetch(originalImage).then(r => r.blob());
      const resBlob = await removeBackground(blob);
      const processedUrl = URL.createObjectURL(resBlob);
      setTransparentImage(processedUrl);
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("背景透過に失敗しました: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (step === 3 && transparentImage && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        const scale = Math.min(300 / img.width, 300 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (300 - w) / 2;
        const y = (300 - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        if (stampText) {
          ctx.font = 'bold 48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.lineWidth = 6;
          ctx.strokeStyle = '#000';
          ctx.fillStyle = '#fff';
          ctx.strokeText(stampText, 150, 290);
          ctx.fillText(stampText, 150, 290);
        }
      };
      img.src = transparentImage;
    }
  }, [step, transparentImage, stampText]);

  const handleSave = () => {
    if (!canvasRef.current) return;
    const base64Data = canvasRef.current.toDataURL('image/png');
    // 親コンポーネント（page）でSupabaseに送る
    onSave(base64Data);
    onClose();
  };
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '90%', maxWidth: '500px', background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>オリジナルスタンプを作成</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 20px', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', width: '100%' }}>
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <label style={{ 
              width: '100%', height: '240px', border: '2px dashed rgba(255, 255, 255, 0.15)', 
              borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', 
              justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer',
              transition: 'all 0.2s', background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <Upload size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>クリックして画像を選択</p>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          )}

          {step === 2 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              {originalImage ? (
                <div style={{ width: '300px', height: '300px', borderRadius: '16px', overflow: 'hidden', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
                  <img src={originalImage} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ) : null}
              
              <button className="btn-primary" onClick={handleRemoveBackground} disabled={!originalImage || isProcessing} style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                {isProcessing ? <><Loader2 className="animate-spin" size={20} /> 背景を処理中...</> : <><Wand2 size={20} /> 背景を自動で透過する (AI)</>}
              </button>
            </div>
          )}

          {step === 3 && (
             <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
               {transparentImage ? (
                  <>
                    <canvas ref={canvasRef} width={300} height={300} style={{
                        background: 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 50% / 20px 20px',
                        borderRadius: '16px', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                      }} />
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>スタンプの文字</label>
                      <input type="text" value={stampText} onChange={(e) => setStampText(e.target.value)} placeholder="例: ありがとう！"
                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', padding: '12px', borderRadius: '8px', fontSize: '1rem' }} />
                    </div>
                  </>
               ) : null}
             </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button className="btn-glass" onClick={onClose}>閉じる</button>
          {step === 3 ? (
             <button className="btn-primary" onClick={handleSave} disabled={!transparentImage} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
               <Check size={18} /> スタンプを利用する
             </button>
          ) : (
             <button className="btn-primary" onClick={() => setStep(step < 3 ? step + 1 : 1)} disabled={step === 2 && !transparentImage}>
                手動でスキップ
             </button>
          )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 100% { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }`}} />
    </div>
  );
}
