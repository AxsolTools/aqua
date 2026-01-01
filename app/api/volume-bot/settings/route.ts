/**
 * Volume Bot Settings API
 * 
 * 🎮 Configure your money printer
 * 
 * GET /api/volume-bot/settings?tokenMint=xxx
 *   → Get settings for a token
 * 
 * POST /api/volume-bot/settings
 *   → Create or update settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/volume-bot';
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    
    if (!tokenMint) {
      return NextResponse.json({ error: 'tokenMint is required' }, { status: 400 });
    }
    
    const settings = await getSettings(userId, tokenMint);
    
    return NextResponse.json({
      success: true,
      settings,
      // 💡 Helpful tips for degens
      tips: {
        strategy: {
          DBPM: '🐂 Bullish mode - creates buy pressure',
          PLD: '🛡️ Defensive mode - counters dumps',
          CMWA: '🧠 Galaxy brain - multi-wallet arbitrage'
        },
        buyPressure: 'Higher % = more buys than sells. 70+ recommended for pumping.',
        emergencyStop: '🚨 NEVER disable this unless you want to donate to the blockchain!'
      }
    });
  } catch (error) {
    console.error('[VOLUME_BOT_API] GET settings error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get settings' },
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
    const { tokenMint, settings } = body;
    
    if (!tokenMint) {
      return NextResponse.json({ error: 'tokenMint is required' }, { status: 400 });
    }
    
    // Validate settings
    if (settings) {
      // Buy pressure must be 0-100
      if (settings.buyPressurePercent !== undefined) {
        if (settings.buyPressurePercent < 0 || settings.buyPressurePercent > 100) {
          return NextResponse.json({ 
            error: 'buyPressurePercent must be between 0 and 100',
            tip: '💡 70+ recommended for bullish pressure' 
          }, { status: 400 });
        }
      }
      
      // Target volume must be positive
      if (settings.targetVolumeSol !== undefined && settings.targetVolumeSol <= 0) {
        return NextResponse.json({ 
          error: 'targetVolumeSol must be positive',
          tip: '💡 Start small (0.1-1 SOL) to test' 
        }, { status: 400 });
      }
      
      // Emergency stop should stay enabled (strong warning)
      if (settings.emergencyStopEnabled === false) {
        console.warn(`[VOLUME_BOT] ⚠️ User ${userId} disabled emergency stop!`);
      }
    }
    
    const savedSettings = await saveSettings(userId, tokenMint, settings || {});
    
    return NextResponse.json({
      success: true,
      settings: savedSettings,
      message: '✅ Settings saved! Ready to go brrr 🚀'
    });
  } catch (error) {
    console.error('[VOLUME_BOT_API] POST settings error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}

