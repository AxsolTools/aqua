/**
 * Volume Bot Session API
 * 
 * 🚀 Control your money printer
 * 
 * POST /api/volume-bot/session (action: start)
 *   → Start a new session
 * 
 * POST /api/volume-bot/session (action: stop)
 *   → Stop a running session
 * 
 * POST /api/volume-bot/session (action: emergency_stop)
 *   → 🚨 EMERGENCY STOP - Stops everything immediately
 * 
 * GET /api/volume-bot/session?tokenMint=xxx
 *   → Get current session status
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  startSession, 
  stopSession, 
  emergencyStop,
  getSessionStatus,
  listActiveSessions
} from '@/lib/volume-bot';
import { createClient } from '@supabase/supabase-js';

// Get authenticated user ID
async function getUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    
    return user.id;
  } catch {
    return null;
  }
}

// Get user wallets from database
async function getUserWallets(userId: string): Promise<Array<{
  wallet_id: string;
  user_id: string;
  wallet_address: string;
  name?: string;
}>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data, error } = await supabase
    .from('wallets')
    .select('id, user_id, address, name, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  
  if (error) {
    console.error('[VOLUME_BOT] Error fetching wallets:', error);
    return [];
  }
  
  return (data || []).map(w => ({
    wallet_id: w.id,
    user_id: w.user_id,
    wallet_address: w.address,
    name: w.name
  }));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    
    if (tokenMint) {
      // Get specific session
      const sessionInfo = getSessionStatus(userId, tokenMint);
      
      return NextResponse.json({
        success: true,
        isRunning: !!sessionInfo,
        session: sessionInfo?.session || null,
        settings: sessionInfo?.settings || null
      });
    } else {
      // List all active sessions
      const sessions = listActiveSessions(userId);
      
      return NextResponse.json({
        success: true,
        activeSessions: sessions.length,
        sessions: sessions.map(s => ({
          tokenMint: s.session.tokenMint,
          status: s.session.status,
          executedVolume: s.session.executedVolumeSol,
          targetVolume: s.session.targetVolumeSol,
          progressPercent: (s.session.executedVolumeSol / s.session.targetVolumeSol) * 100
        }))
      });
    }
  } catch (error) {
    console.error('[VOLUME_BOT_API] GET session error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get session' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { action, tokenMint, settings, walletIds, platform, currentPrice } = body;
    
    if (!tokenMint) {
      return NextResponse.json({ error: 'tokenMint is required' }, { status: 400 });
    }
    
    switch (action) {
      case 'start': {
        // Get user wallets
        let wallets = await getUserWallets(userId);
        
        // Filter by walletIds if specified
        if (walletIds && Array.isArray(walletIds) && walletIds.length > 0) {
          wallets = wallets.filter(w => walletIds.includes(w.wallet_id));
        }
        
        if (wallets.length === 0) {
          return NextResponse.json({
            error: 'No wallets available',
            tip: '👛 Add some wallets first! You need at least one to start the volume bot.'
          }, { status: 400 });
        }
        
        const { session, settings: savedSettings } = await startSession({
          userId,
          tokenMint,
          wallets,
          settings,
          platform,
          currentPrice
        });
        
        return NextResponse.json({
          success: true,
          message: '🚀 Volume bot started! Charts go brrr now.',
          session: {
            id: session.id,
            tokenMint: session.tokenMint,
            status: session.status,
            targetVolume: session.targetVolumeSol
          },
          settings: {
            strategy: savedSettings.strategy,
            buyPressure: savedSettings.buyPressurePercent,
            tradeInterval: savedSettings.tradeIntervalMs
          },
          walletsUsed: wallets.length,
          tips: [
            '📈 Watch the chart - you should see activity soon',
            '🛑 Use emergency_stop if things go wrong',
            '💰 Session will auto-stop when target volume is reached'
          ]
        });
      }
      
      case 'stop': {
        const stopped = await stopSession(userId, tokenMint, 'manual');
        
        if (!stopped) {
          return NextResponse.json({
            success: false,
            message: 'No active session found for this token',
            tip: '🤔 Maybe it already stopped or was never started?'
          });
        }
        
        return NextResponse.json({
          success: true,
          message: '🛑 Volume bot stopped. Good run, anon!',
          tip: 'Check your wallet balances and review the session history'
        });
      }
      
      case 'emergency_stop': {
        console.warn(`[VOLUME_BOT] 🚨 EMERGENCY STOP triggered by user ${userId} for ${tokenMint}`);
        
        const stopped = await emergencyStop(userId, tokenMint, {
          reason: body.reason || 'user_triggered',
          timestamp: Date.now()
        });
        
        return NextResponse.json({
          success: true,
          stopped,
          message: '🚨 EMERGENCY STOP executed! All trading halted.',
          tip: 'Review what happened and check your wallet balances before restarting.'
        });
      }
      
      default:
        return NextResponse.json({
          error: 'Invalid action',
          validActions: ['start', 'stop', 'emergency_stop'],
          tip: '💡 Use "start" to begin, "stop" to end gracefully, or "emergency_stop" for the panic button'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[VOLUME_BOT_API] POST session error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process request',
        tip: '🔧 Check the error message and try again. If persistent, contact support.'
      },
      { status: 500 }
    );
  }
}

