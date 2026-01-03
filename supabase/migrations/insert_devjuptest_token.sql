-- Insert the DEVJUPTEST Jupiter token created before database update
-- Run this AFTER running add_jupiter_columns.sql
-- 
-- Instructions:
-- 1. First run: add_jupiter_columns.sql (to add the new columns)
-- 2. Then run this file to insert the token

-- Check if token already exists, if so update it, otherwise insert
INSERT INTO tokens (
  mint_address,
  name,
  symbol,
  description,
  pool_type,
  is_platform_token,
  stage,
  created_at
) VALUES (
  'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx',
  'DEVJUPTEST',
  'DEVJUPTEST',
  'Jupiter DBC test token created on PROPEL platform',
  'jupiter',
  TRUE,
  'active',
  NOW()
)
ON CONFLICT (mint_address) 
DO UPDATE SET 
  pool_type = 'jupiter',
  is_platform_token = TRUE,
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol;

