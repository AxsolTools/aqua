/**
 * AQUA Launchpad - Referral Stats API
 * 
 * GET: Get user's referral statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReferralStats, REFERRAL_CONFIG } from '@/lib/referral';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5000,
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }
    
    if (!REFERRAL_CONFIG.enabled) {
      return NextResponse.json({
        success: true,
        data: {
          enabled: false,
          message: 'Referral system is currently disabled',
        },
      });
    }
    
    const stats = await getReferralStats(userId);
    
    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        ...stats,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral stats error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to get referral stats',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

