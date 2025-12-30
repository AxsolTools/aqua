/**
 * AQUA Launchpad - Referral Stats API
 * 
 * GET: Get user's referral statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReferralStats, REFERRAL_CONFIG } from '@/lib/referral';

export async function GET(request: NextRequest) {
  try {
    // Get wallet address from query params (primary auth method)
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');
    
    // Fallback to header
    const userId = walletAddress || request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5000,
            message: 'Wallet address required',
          },
        },
        { status: 401 }
      );
    }
    
    if (!REFERRAL_CONFIG.enabled) {
      // Return default stats when disabled
      return NextResponse.json({
        success: true,
        data: {
          enabled: false,
          totalReferred: 0,
          activeReferrals: 0,
          totalEarnings: 0,
          pendingEarnings: 0,
          claimableAmount: 0,
          lastClaimAt: null,
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

