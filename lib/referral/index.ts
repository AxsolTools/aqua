/**
 * AQUA Launchpad - Referral Module
 */

export {
  // Types
  type ReferralStats,
  type ReferralEarningsResult,
  type ClaimResult,
  
  // Configuration
  REFERRAL_CONFIG,
  
  // Code management
  getOrCreateReferral,
  applyReferralCode,
  
  // Earnings
  calculateReferrerShare,
  addReferralEarnings,
  getReferrer,
  
  // Stats
  getReferralStats,
  
  // Claims
  processClaim,
} from './manager';

