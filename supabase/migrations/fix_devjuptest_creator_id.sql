-- Fix DEVJUPTEST token to have correct creator_id
-- Links the token to the user account that owns the creator wallet

-- Update creator_id by finding the user with matching main_wallet_address
UPDATE public.tokens t
SET creator_id = u.id
FROM public.users u
WHERE u.main_wallet_address = 'AbiN8j5FpLBoVDpvg2vWP5caFdSVU9bqGUGGbQPRvdsR'
  AND t.mint_address = 'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx';

-- Also ensure creator_wallet is set correctly
UPDATE public.tokens
SET 
  creator_wallet = 'AbiN8j5FpLBoVDpvg2vWP5caFdSVU9bqGUGGbQPRvdsR',
  pool_type = 'jupiter',
  is_platform_token = TRUE
WHERE mint_address = 'FkGLiGXEobmQgnwqK3aN2tQoLHu6hZhNWx9sMgEpjupx';

