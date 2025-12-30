/**
 * AQUA Launchpad - Referral Code API
 * 
 * GET: Get user's referral code
 * Creates one if doesn't exist
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
    
    // Generate a deterministic referral code from wallet address
    // This avoids database dependency issues
    const referralCode = userId.slice(0, 8).toUpperCase();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aqua-launchpad-rfvtv.ondigitalocean.app';
    
    return NextResponse.json({
      success: true,
      data: {
        referralCode,
        isNew: false,
        sharePercent: 50,
        shareLink: `${baseUrl}?ref=${referralCode}`,
      },
    });
    
  } catch (error) {
    console.error('[API] Referral code error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get referral code',
      },
      { status: 500 }
    );
  }
}

