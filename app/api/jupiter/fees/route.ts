/**
 * Jupiter Fee Monitoring API
 * 
 * Get unclaimed fees for a Jupiter DBC pool
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getJupiterFeeInfo, getJupiterPoolAddress } from '@/lib/blockchain/jupiter-studio';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mintAddress = searchParams.get('mint');
    const poolAddress = searchParams.get('pool');

    if (!mintAddress && !poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Either mint or pool address is required' } },
        { status: 400 }
      );
    }

    let resolvedPoolAddress = poolAddress;

    // If only mint address provided, get pool address first
    if (!resolvedPoolAddress && mintAddress) {
      try {
        resolvedPoolAddress = await getJupiterPoolAddress(mintAddress);
      } catch (error) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 4004, 
              message: 'Could not find DBC pool for this token',
              details: error instanceof Error ? error.message : 'Unknown error'
            } 
          },
          { status: 404 }
        );
      }
    }

    // Get fee info
    const feeInfo = await getJupiterFeeInfo(resolvedPoolAddress!);

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: feeInfo.poolAddress,
        totalFees: feeInfo.totalFees,
        unclaimedFees: feeInfo.unclaimedFees,
        claimedFees: feeInfo.claimedFees,
        mintAddress: mintAddress || null,
      },
    });

  } catch (error) {
    console.error('[JUPITER-FEES] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to fetch fee information',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mintAddress, poolAddress } = body;

    if (!mintAddress && !poolAddress) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Either mint or pool address is required' } },
        { status: 400 }
      );
    }

    let resolvedPoolAddress = poolAddress;

    // If only mint address provided, get pool address first
    if (!resolvedPoolAddress && mintAddress) {
      try {
        resolvedPoolAddress = await getJupiterPoolAddress(mintAddress);
      } catch (error) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 4004, 
              message: 'Could not find DBC pool for this token',
              details: error instanceof Error ? error.message : 'Unknown error'
            } 
          },
          { status: 404 }
        );
      }
    }

    // Get fee info
    const feeInfo = await getJupiterFeeInfo(resolvedPoolAddress!);

    return NextResponse.json({
      success: true,
      data: {
        poolAddress: feeInfo.poolAddress,
        totalFees: feeInfo.totalFees,
        unclaimedFees: feeInfo.unclaimedFees,
        claimedFees: feeInfo.claimedFees,
        mintAddress: mintAddress || null,
      },
    });

  } catch (error) {
    console.error('[JUPITER-FEES] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5000,
          message: 'Failed to fetch fee information',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

