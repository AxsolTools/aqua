/**
 * AQUA Launchpad - Referral Code API
 * 
 * GET: Get user's referral code
 * Creates one if doesn't exist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateReferral, getReferralStats, REFERRAL_CONFIG } from '@/lib/referral';

export async function GET(request: NextRequest) {
  try {
    // Get user ID from header (set by auth middleware)
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
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5005,
            message: 'Referral system is currently disabled',
          },
        },
        { status: 503 }
      );
    }
    
    const { referralCode, isNew } = await getOrCreateReferral(userId);
    
    return NextResponse.json({
      success: true,
      data: {
        referralCode,
        isNew,
        sharePercent: REFERRAL_CONFIG.sharePercent,
        shareLink: `${process.env.NEXT_PUBLIC_APP_URL || ''}?ref=${referralCode}`,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral code error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to get referral code',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

