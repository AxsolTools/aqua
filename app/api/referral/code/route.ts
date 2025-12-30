/**
 * AQUA Launchpad - Referral Code API
 * 
 * GET: Get user's referral code
 * Creates one if doesn't exist
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateReferral, REFERRAL_CONFIG } from '@/lib/referral';

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
      // Return a default response when disabled
      return NextResponse.json({
        success: true,
        data: {
          referralCode: userId.slice(0, 8).toUpperCase(),
          isNew: false,
          sharePercent: 50,
          shareLink: `${process.env.NEXT_PUBLIC_APP_URL || ''}?ref=${userId.slice(0, 8).toUpperCase()}`,
        },
      });
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

