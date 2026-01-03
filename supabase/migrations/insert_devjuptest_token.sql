-- Insert the DEVJUPTEST Jupiter token created before database update
-- Run this AFTER running add_jupiter_columns.sql
-- 
-- Instructions:
-- 1. First run: add_jupiter_columns.sql (to add the new columns)
-- 2. Then run this file to insert the token
--
-- NOTE: Replace 'YOUR_CREATOR_WALLET_ADDRESS' with your actual wallet address

INSERT INTO tokens (
  mint_address,
  name,
  symbol,
  description,
  creator_wallet,
  total_supply,
  pool_type,
  is_platform_token,
  stage,
  created_at
) VALUES (
  'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx',
  'DEVJUPTEST',
  'DEVJUPTEST',
  'Jupiter DBC test token created on PROPEL platform',
  'AbiN8j5FpLBoVDpvg2vWP5caFdSVU9bqGUGGbQPRvdsR',
  1000000000,
  'jupiter',
  TRUE,
  'bonding',
  NOW()
)
ON CONFLICT (mint_address) 
DO UPDATE SET 
  pool_type = 'jupiter',
  is_platform_token = TRUE,
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol;

