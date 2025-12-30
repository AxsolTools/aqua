/**
 * AQUA Launchpad - Fees Module
 * 
 * Exports all fee-related functionality
 */

export {
  // Types
  type FeeBreakdown,
  type BalanceValidation,
  type FeeCollectionResult,
  type OperationType,
  
  // Configuration
  getDeveloperWallet,
  isFeeCollectionEnabled,
  
  // Validation
  validateBalanceForTransaction,
  revalidateBalance,
  
  // Collection
  collectPlatformFee,
  executeWithFeeCollection,
  
  // Display helpers
  getEstimatedFeesForDisplay,
} from './collector';

