//! TEST ONLY: creates genuine native-transfer failures by deleting its own account.
//! Never deploy this fixture as a production worker, verifier or client.
#[cfg(target_arch = "wasm32")]
mod actor {
    use near_sdk::serde_json::json;
    use near_sdk::{AccountId, Gas, NearToken, Promise, env, near};
    #[near(contract_state)]
    #[derive(Default)]
    pub struct Actor {}
    #[near]
    impl Actor {
        #[init]
        pub fn new() -> Self {
            Self {}
        }
        #[private]
        pub fn withdraw_then_delete(&self, escrow: AccountId, beneficiary: AccountId) {
            Promise::new(escrow)
                .function_call(
                    "withdraw_claimable",
                    b"{}".to_vec(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(100),
                )
                .detach();
            Promise::new(env::current_account_id())
                .delete_account(beneficiary)
                .detach();
        }
        #[private]
        pub fn refund_then_delete(
            &self,
            escrow: AccountId,
            beneficiary: AccountId,
            order_id: String,
        ) {
            Promise::new(escrow)
                .function_call(
                    "claim_refund",
                    json!({"order_id":order_id}).to_string().into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(100),
                )
                .detach();
            Promise::new(env::current_account_id())
                .delete_account(beneficiary)
                .detach();
        }
        #[private]
        pub fn withdraw_then_finalize(&self, escrow: AccountId, order_id: String) -> Promise {
            Promise::new(escrow)
                .function_call(
                    "withdraw_claimable",
                    b"{}".to_vec(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(100),
                )
                .function_call(
                    "finalize_success",
                    json!({"order_id":order_id}).to_string().into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(70),
                )
        }
    }
}
