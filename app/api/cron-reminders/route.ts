import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Vercel Cron から呼ばれることを想定
export async function GET(request: Request) {
  // 自動実行や手動実行のための認証チェック（今回はCronから呼ばれる想定でシンプルに）
  // 実際にはリクエストヘッダーで Authorization Bearer CRON_SECRET 等をチェックします。
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
  }

  // cronからはサーバーサイドキーでアクセスするのが望ましい
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    
    // 現在時刻を過ぎていて、アクティブなリマインダーを取得
    const { data: reminders, error } = await supabase
      .from('scheduled_reminders')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', now.toISOString());

    if (error) {
      console.error("Failed to fetch reminders:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: 'No pending reminders' });
    }

    const messagesToInsert = [];
    const remindersToUpdate = [];
    const remindersToDeactivate = [];

    // もちのアイコンのURL（一旦決め打ち。画像はユーザー側でpublicに配置）
    const mochiIconUrl = '/mochi.png';

    for (const reminder of reminders) {
      // 1. メッセージ投稿用のデータを作成
      messagesToInsert.push({
        text: reminder.message,
        user_id: 'mochi', // もちからの発言として固定
        image_url: null, // テキストのみ
        // もしDBに sender_icon などあれば入れるが、表示側で mochi だったらアイコンを出す処理にする
      });

      // 2. スケジュールの更新または無効化
      if (reminder.schedule_type === 'once') {
        remindersToDeactivate.push(reminder.id);
      } else {
        // 'daily', 'weekly', 'monthly', 'monthly_nth' に応じた次の実行日時を計算
        let nextRun = new Date(reminder.next_run_at);
        
        const advanceNextRun = (currentUTC: Date, type: string, detail: any) => {
          // JST (+9時間) としてオフセットを加えてからDateオブジェクトを生成することで、getMonth()やgetDay()がJSTベースの適切な値になるようにする
          let d = new Date(currentUTC.getTime() + 9 * 60 * 60 * 1000);
          
          if (type === 'daily') {
            d.setDate(d.getDate() + 1);
          } else if (type === 'weekly') {
            d.setDate(d.getDate() + 7);
          } else if (type === 'monthly_date' || type === 'monthly') {
            const dayOfMonth = detail?.dayOfMonth || d.getDate();
            d.setMonth(d.getMonth() + 1, 1); 
            const nextMonthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(dayOfMonth, nextMonthDays));
          } else if (type === 'monthly_nth') {
            const jsDay = detail?.dayOfWeek === 7 ? 0 : (detail?.dayOfWeek || 1);
            const nthWeek = detail?.nthWeek || 1;
            
            d.setMonth(d.getMonth() + 1, 1); // 翌月の1日へ
            
            while (true) {
              let expectedMonth = d.getMonth();
              let tempD = new Date(d.getTime());
              let count = 0;
              let found = false;
              
              while (tempD.getMonth() === expectedMonth) {
                if (tempD.getDay() === jsDay) {
                  count++;
                  if (count === nthWeek) {
                    d = tempD;
                    found = true;
                    break;
                  }
                }
                tempD.setDate(tempD.getDate() + 1);
              }
              
              if (found) break; // 無事見つかったらループ終了
              
              // もし「第5曜日」が存在せず月を越えてしまった場合は、さらに翌月の1日にセットして再挑戦する
              d.setMonth(d.getMonth() + 1, 1);
            }
          }
          
          // 計算が終わったらJSTのオフセット(-9時間)を戻して、正しいUTC時刻のDateオブジェクトにして返す
          return new Date(d.getTime() - 9 * 60 * 60 * 1000);
        };

        nextRun = advanceNextRun(nextRun, reminder.schedule_type, reminder.schedule_detail);
        
        // 念のため、計算結果が「今」よりまだ過去の場合は、来るべき未来まで進める
        while (nextRun <= now) {
          nextRun = advanceNextRun(nextRun, reminder.schedule_type, reminder.schedule_detail);
        }

        remindersToUpdate.push({
          id: reminder.id,
          next_run_at: nextRun.toISOString()
        });
      }
    }

    // 3. メッセージをまとめてINSERT
    if (messagesToInsert.length > 0) {
      const { error: insertError } = await supabase.from('messages').insert(messagesToInsert);
      if (insertError) console.error("Error inserting messages:", insertError);
    }

    // 4. 定期リマインダーの次回実行日時の更新
    for (const updateData of remindersToUpdate) {
      await supabase.from('scheduled_reminders')
        .update({ next_run_at: updateData.next_run_at })
        .eq('id', updateData.id);
    }

    // 5. 単発リマインダーを無効化
    if (remindersToDeactivate.length > 0) {
      await supabase.from('scheduled_reminders')
        .update({ is_active: false })
        .in('id', remindersToDeactivate);
    }

    return NextResponse.json({ 
      message: `Processed ${reminders.length} reminders`,
      inserted: messagesToInsert.length 
    });

  } catch (err: any) {
    console.error("Cron exception", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
