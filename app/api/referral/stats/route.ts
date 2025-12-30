/**
 * AQUA Launchpad - Referral Stats API
 * 
 * GET: Get user's referral statistics
 */

import { NextRequest, NextResponse } from 'next/server';

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
          error: 'Wallet address required',
        },
        { status: 401 }
      );
    }
    
    // Return default stats - referral tracking will be enabled when database is fully set up
    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        totalReferred: 0,
        activeReferrals: 0,
        totalEarnings: 0,
        pendingEarnings: 0,
        claimableAmount: 0,
        lastClaimAt: null,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral stats error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get referral stats',
      },
      { status: 500 }
    );
  }
}

