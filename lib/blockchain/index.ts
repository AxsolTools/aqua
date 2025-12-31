/**
 * AQUA Launchpad - Blockchain Module
 * 
 * Exports all blockchain-related functionality
 */

// PumpPortal integration (Pump.fun)
export {
  // Types
  type TokenMetadata,
  type CreateTokenParams,
  type CreateTokenResult,
  type TradeParams,
  type TradeResult,
  
  // IPFS
  uploadToIPFS,
  
  // Token creation
  createToken,
  
  // Trading
  buyOnBondingCurve,
  sellOnBondingCurve,
  
  // Creator vault
  getCreatorVaultBalance,
  claimCreatorRewards,
  
  // Constants
  PUMP_PROGRAM_ID,
  PUMP_GLOBAL_ACCOUNT,
  PUMP_FEE_RECIPIENT,
} from './pumpfun';

// Token-2022 integration
export {
  // Types
  type Token22Metadata,
  type CreateToken22Params,
  type CreateToken22Result,
  type MintTokensParams,
  
  // Token creation
  createToken22,
  mintTokens,
  uploadToken22Metadata,
  validateToken22Params,
  
  // Constants
  TOKEN_2022_PROGRAM_ID,
} from './token22';

// Raydium CPMM integration
export {
  // Types
  type CreatePoolParams,
  type CreatePoolResult,
  type AddLiquidityParams,
  type RemoveLiquidityParams,
  type LiquidityResult,
  type PoolInfo,
  
  // Pool creation
  createCPMMPool,
  
  // Liquidity management
  addLiquidity,
  removeLiquidity,
  lockLpTokens,
  
  // Pool queries
  getPoolInfo,
  calculatePriceFromReserves,
  
  // Constants
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_CPMM_FEE_ACCOUNT,
  WSOL_MINT,
} from './raydium-cpmm';

// Transfer fee management
export {
  // Types
  type HarvestFeesParams,
  type WithdrawFeesParams,
  type FeeHarvestResult,
  type WithheldFeesInfo,
  
  // Fee operations
  getAccountsWithWithheldFees,
  harvestFeesToMint,
  withdrawFeesFromMint,
  completeTransferFeeWithdrawal,
  getWithheldFeesInfo,
} from './transfer-fees';
