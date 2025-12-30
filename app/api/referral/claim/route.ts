/**
 * AQUA Launchpad - Referral Claim API
 * 
 * POST: Claim pending referral earnings
 */

import { NextRequest, NextResponse } from 'next/server';
import { processClaim, REFERRAL_CONFIG } from '@/lib/referral';

export async function POST(request: NextRequest) {
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
    
    const body = await request.json();
    const { destinationWallet } = body;
    
    if (!destinationWallet || typeof destinationWallet !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5004,
            message: 'Destination wallet address is required',
          },
        },
        { status: 400 }
      );
    }
    
    // Validate wallet address format
    if (destinationWallet.length < 32 || destinationWallet.length > 44) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 5004,
            message: 'Invalid wallet address format',
          },
        },
        { status: 400 }
      );
    }
    
    const result = await processClaim(userId, destinationWallet);
    
    if (!result.success) {
      const errorCode = result.error?.includes('cooldown') ? 5003 
        : result.error?.includes('Minimum') ? 5004 
        : 5000;
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: errorCode,
            message: result.error || 'Failed to process claim',
          },
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        claimId: result.claimId,
        amount: result.amount,
        amountFormatted: `${result.amount?.toFixed(6)} SOL`,
        txSignature: result.txSignature,
        message: 'Claim processed successfully!',
      },
    });
    
  } catch (error) {
    console.error('[API] Referral claim error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to process claim',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

