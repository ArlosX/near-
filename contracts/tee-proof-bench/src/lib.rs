//! TEST ONLY. This contract is a gas/conformance harness, never a settlement authority.
#[path = "../../work-escrow/src/near_crypto.rs"]
mod near_crypto;
#[path = "../../work-escrow/src/state.rs"]
mod state;
#[path = "../../work-escrow/src/tee.rs"]
mod tee;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::{env, near};
#[near(contract_state)]
#[derive(Default)]
pub struct Bench {}
#[near]
impl Bench {
    #[init]
    pub fn new() -> Self {
        Self {}
    }
    pub fn verify(&self, quote: Base64VecU8, collateral: String, at: U64) -> String {
        let c: dcap_qvl::QuoteCollateralV3 = near_sdk::serde_json::from_str(&collateral).unwrap();
        let v = dcap_qvl::verify::QuoteVerifier::new(
            include_bytes!("../../work-escrow/src/intel-root.der").to_vec(),
        )
        .verify_with::<near_crypto::NearConfig>(&quote.0, &c, at.0)
        .unwrap();
        env::log_str(&format!("CRYPTO_GAS:{}", env::used_gas().as_gas()));
        v.status
    }
    // Exercises production output/context decoding and the complete crypto gate
    // against historical public fixtures. It creates no order and authorizes no money.
    pub fn check_historical(
        &self,
        proof: tee::Proof,
        collateral: String,
        pending: tee::Pending,
        output_data: String,
        agreement_hash: String,
        profile: Option<String>,
    ) -> String {
        let order = state::Order {
            client: "fixture.testnet".into(),
            verifier: proof.caller_account_id.clone(),
            agreement_hash,
            cutoff: env::block_timestamp() + 1_000_000_000,
            principal: 100,
            tasks: vec![],
            status: state::Status::Open,
            refund_pending: None,
            refunded: false,
        };
        let result = tee::validate_proof(&proof, &pending, &order, &output_data);
        let expected = profile.as_deref().map(tee::measurements_for).unwrap_or(tee::MEASUREMENTS);
        tee::verify_crypto(&proof, &collateral, expected);
        env::log_str(&format!("CLAIM_GAS:{}", env::used_gas().as_gas()));
        tee::field(&result, "decision").to_string()
    }
}
