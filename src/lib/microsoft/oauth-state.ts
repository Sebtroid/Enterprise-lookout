import { createOAuthNonce, hashOAuthNonce, signOAuthState, verifyOAuthNonce, verifyOAuthState } from "@/lib/gmail/oauth-state";

export const MICROSOFT_OAUTH_NONCE_COOKIE = "microsoft_oauth_nonce";

export {
  createOAuthNonce,
  hashOAuthNonce,
  signOAuthState,
  verifyOAuthNonce,
  verifyOAuthState,
};
