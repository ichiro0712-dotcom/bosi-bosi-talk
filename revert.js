const fs = require('fs');
const file = 'app/components/ReminderModal.tsx';
let txt = fs.readFileSync(file, 'utf8');

// remove anniversaryDate, settingsId etc.
txt = txt.replace(/  const \[settingsId, setSettingsId\] = useState<string \| null>\(null\);\n  const \[anniversaryDate, setAnniversaryDate\] = useState<string>\(''\);\n/, '');

// remove fetchSettings
txt = txt.replace(/  useEffect\(\(\) => \{\n    fetchReminders\(\);\n    fetchSettings\(\);\n  \}, \[\]\);\n\n  const fetchSettings = async \(\) => \{\n    const \{ data \} = await supabase\.from\('couple_settings'\)\.select\('\*'\)\.limit\(1\)\.single\(\);\n    if \(data\) \{\n      setSettingsId\(data\.id\);\n      if \(data\.anniversary_date\) setAnniversaryDate\(data\.anniversary_date\);\n    \}\n  \};\n\n  const saveAnniversary = async \(newDate: string\) => \{\n    setAnniversaryDate\(newDate\);\n    if \(!newDate\) return;\n    if \(settingsId\) \{\n      await supabase\.from\('couple_settings'\)\.update\(\{ anniversary_date: newDate \}\)\.eq\('id', settingsId\);\n    \} else \{\n      const \{ data \} = await supabase\.from\('couple_settings'\)\.insert\(\[\{ anniversary_date: newDate \}\]\)\.select\(\)\.single\(\);\n      if \(data\) setSettingsId\(data\.id\);\n    \}\n  \};\n/, '  useEffect(() => {\n    fetchReminders();\n  }, []);\n');

// remove the UI part
txt = txt.replace(/              \{\/\* 記念日設定 \*\/\}\n              <div style=\{\{ background: 'rgba\(244, 63, 94, 0\.05\)', borderRadius: '16px', padding: '16px', border: '1px solid rgba\(244, 63, 94, 0\.2\)' \}\}>\n                <div style=\{\{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' \}\}>\n                  <span style=\{\{ fontSize: '1\.2rem' \}\}>💕<\/span>\n                  <span style=\{\{ fontWeight: 800, color: '#e11d48' \}\}>記念日設定<\/span>\n                <\/div>\n                <p style=\{\{ fontSize: '0\.75rem', color: 'var\(--text-muted\)', marginBottom: '12px' \}\}>\n                  交際開始日を設定すると、ホーム画面のカウンターが動きます。\n                <\/p>\n                <div style=\{\{ display: 'flex', gap: '12px' \}\}>\n                  <input \n                    type="date" \n                    value=\{anniversaryDate\} \n                    onChange=\{e => saveAnniversary\(e\.target\.value\)\} \n                    style=\{\{ flex: 1, padding: '10px 12px', borderRadius: '12px', border: '1px solid var\(--glass-border\)', background: 'white', outline: 'none' \}\} \n                  \/>\n                <\/div>\n              <\/div>\n\n              \{\/\* リマインダ一覧 \*\/\}\n/, '');

// Fix div closure
txt = txt.replace(/            <div style=\{\{ display: 'flex', flexDirection: 'column', gap: '24px' \}\}>\n/, '            <div>\n');
txt = txt.replace(/              \)}\n              <\/div>\n            <\/div>/, '              )}\n            </div>');

fs.writeFileSync(file, txt);
