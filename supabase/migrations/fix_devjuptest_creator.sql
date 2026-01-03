-- Fix DEVJUPTEST token to have correct creator_wallet
-- The creator wallet should match the wallet that actually created the token

UPDATE public.tokens
SET 
  creator_wallet = 'AbiN8j5FpLBoVDpvg2vWP5caFdSVU9bqGUGGbQPRvdsR',
  pool_type = 'jupiter',
  is_platform_token = TRUE
WHERE mint_address = 'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx';

-- If the token doesn't exist, insert it
INSERT INTO public.tokens (
  mint_address,
  name,
  symbol,
  description,
  creator_wallet,
  total_supply,
  decimals,
  pool_type,
  is_platform_token,
  stage,
  created_at
) 
SELECT 
  'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx',
  'DEVJUPTEST',
  'DEVJUPTEST',
  'Jupiter DBC test token created on PROPEL platform',
  'AbiN8j5FpLBoVDpvg2vWP5caFdSVU9bqGUGGbQPRvdsR',
  1000000000,
  6,
  'jupiter',
  TRUE,
  'bonding',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.tokens WHERE mint_address = 'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx'
);

