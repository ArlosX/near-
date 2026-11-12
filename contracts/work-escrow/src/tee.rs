//! Fixed Testnet profile. No operator callback or relayer verdict is an acceptance authority.
//! Exact quote verification is separate from application-context validation.
use crate::state::{self, Order, Status};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{Value, json};
use near_sdk::{env, require};

pub const PROFILE: &str = "outlayer-tdx-direct-v1";
pub const CODE: &str = "bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051";
pub const COLLATERAL: &str = "2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140";
pub const MEASUREMENTS: &str = "5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3";
pub const PROFILE_VALID_UNTIL_NS: u64 = 1796688919000000000;
pub const MAX_INPUT: usize = 65536;
pub const MAX_OUTPUT: usize = 16384;
const ROOT: &[u8] = include_bytes!("intel-root.der");
fn no_random(_: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}
getrandom::register_custom_getrandom!(no_random);

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct Pending {
    pub task_id: String,
    pub request_id: String,
    pub revision: u64,
    pub artifact_hash: String,
    pub policy_hash: String,
    pub inner_hash: String,
    pub input_hash: String,
    pub prepared_at_ns: U64,
}
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct TaskProgress {
    pub task_id: String,
    pub revision: u64,
    pub pending: Option<Pending>,
}
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct Frozen {
    pub profile: String,
    pub agreement_json: String,
    pub progress: Vec<TaskProgress>,
}
/// Deliberately narrower than the vendor record: only on-chain WasmUrl executions,
/// no project/secrets/repository fields, no alternate preimage or signature format.
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct Proof {
    pub task_id: i64,
    pub block_height: U64,
    pub timestamp: U64,
    pub caller_account_id: String,
    pub wasm_hash: String,
    pub input_hash: String,
    pub output_hash: String,
    pub quote: Base64VecU8,
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub fn raw_hash(bytes: &[u8]) -> String {
    hex(&env::sha256(bytes))
}
pub fn digest(bytes: &[u8]) -> String {
    format!("sha256:{}", raw_hash(bytes))
}
pub fn canonical(v: &Value) -> String {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|k| format!("{}:{}", json!(k), canonical(&map[*k])))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        Value::Number(n) => {
            require!(
                n.as_i64()
                    .is_some_and(|x| (-9007199254740991..=9007199254740991).contains(&x)),
                "safe integer JSON required"
            );
            n.to_string()
        }
        _ => v.to_string(),
    }
}
pub fn parse_canonical(bytes: &str, max: usize) -> Value {
    require!(bytes.len() <= max, "TEE JSON size limit");
    let v: Value = near_sdk::serde_json::from_str(bytes).expect("invalid TEE JSON");
    require!(canonical(&v) == bytes, "canonical TEE JSON required");
    v
}
pub fn field<'a>(v: &'a Value, name: &str) -> &'a str {
    v[name]
        .as_str()
        .unwrap_or_else(|| env::panic_str(&format!("string field required: {name}")))
}
pub fn exact(v: &Value, names: &[&str]) {
    let map = v.as_object().expect("object required");
    require!(
        map.len() == names.len() && names.iter().all(|n| map.contains_key(*n)),
        "unexpected or missing TEE fields"
    );
}
fn key(order_id: &str) -> Vec<u8> {
    format!("work-escrow:tee:v1:{order_id}").into_bytes()
}
pub fn load(order_id: &str) -> Option<Frozen> {
    env::storage_read(&key(order_id))
        .map(|b| near_sdk::serde_json::from_slice(&b).expect("corrupt frozen TEE state"))
}
pub fn save(order_id: &str, frozen: &Frozen) {
    let bytes = near_sdk::serde_json::to_vec(frozen).expect("TEE state serialization failed");
    require!(bytes.len() <= 12288, "TEE state envelope exceeded");
    env::storage_write(&key(order_id), &bytes);
}
pub fn open(order: &Order) {
    require!(order.status == Status::Open, "terminal order");
    require!(
        env::block_timestamp() < order.cutoff,
        "result cutoff reached"
    );
}
pub fn dependencies(order: &Order, task_id: &str, supplied: &Value) {
    let task = order
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .expect("unknown task");
    let supplied = supplied.as_array().expect("dependency array required");
    require!(
        supplied.len() == task.depends_on.len(),
        "dependency count mismatch"
    );
    let mut seen = Vec::new();
    for dep in supplied {
        let id = field(dep, "taskId");
        require!(
            !seen.contains(&id) && task.depends_on.iter().any(|x| x == id),
            "unexpected dependency"
        );
        seen.push(id);
        let prior = order.tasks.iter().find(|t| t.id == id).unwrap();
        let result = prior.result.as_ref().expect("predecessor not accepted");
        require!(
            result.accepted && field(dep, "artifactHash") == result.artifact_hash,
            "predecessor commitment mismatch"
        );
        require!(
            digest(field(dep, "artifactBytes").as_bytes()) == result.artifact_hash,
            "predecessor bytes mismatch"
        );
    }
}

/// Intel authenticity is checked against a compiled root and pinned collateral,
/// not a bundle's stored verdict or measurements_approved boolean.
pub fn verify_crypto(proof: &Proof, collateral: &str, measurements_hash: &str) {
    require!(
        proof.quote.0.len() >= 1024 && proof.quote.0.len() <= 16384,
        "quote size limit"
    );
    require!(
        collateral.len() <= 131072 && raw_hash(collateral.as_bytes()) == COLLATERAL,
        "unapproved collateral"
    );
    let c: dcap_qvl::QuoteCollateralV3 =
        near_sdk::serde_json::from_str(collateral).expect("invalid collateral");
    let verified = dcap_qvl::verify::QuoteVerifier::new(ROOT.to_vec())
        .verify_with::<crate::near_crypto::NearConfig>(
            &proof.quote.0,
            &c,
            env::block_timestamp() / 1_000_000_000,
        )
        .unwrap_or_else(|_| env::panic_str("Intel TDX verification failed"));
    require!(
        verified.status == "UpToDate" && verified.advisory_ids.is_empty(),
        "unacceptable TCB status"
    );
    let td = verified.report.as_td10().expect("TDX 1.0 quote required");
    let measurements = [
        td.mr_td.as_slice(),
        td.rt_mr0.as_slice(),
        td.rt_mr1.as_slice(),
        td.rt_mr2.as_slice(),
        td.rt_mr3.as_slice(),
    ]
    .concat();
    require!(
        raw_hash(&measurements) == measurements_hash,
        "worker measurements mismatch"
    );
    let mut preimage = Vec::new();
    preimage.extend_from_slice(b"execute");
    preimage.extend_from_slice(&proof.task_id.to_le_bytes());
    preimage.extend_from_slice(b"wasm32-wasip2");
    for v in [&proof.wasm_hash, &proof.input_hash, &proof.output_hash] {
        preimage.extend_from_slice(v.as_bytes());
    }
    preimage.extend_from_slice(&proof.block_height.0.to_le_bytes());
    preimage.extend_from_slice(proof.caller_account_id.as_bytes());
    preimage.extend_from_slice(&(proof.timestamp.0 as i64).to_le_bytes());
    preimage.extend_from_slice(b"0");
    require!(
        td.report_data[..32] == env::sha256(&preimage)
            && td.report_data[32..].iter().all(|b| *b == 0),
        "quote execution commitment mismatch"
    );
}

pub fn validate_proof(proof: &Proof, pending: &Pending, order: &Order, output_data: &str) -> Value {
    require!(
        proof.task_id > 0 && proof.timestamp.0 <= i64::MAX as u64,
        "invalid attestation identifiers"
    );
    require!(
        proof.wasm_hash == CODE && proof.input_hash == pending.input_hash,
        "wrong code or execution input"
    );
    require!(
        proof.caller_account_id == order.verifier,
        "wrong attested caller"
    );
    require!(
        proof.timestamp.0 >= pending.prepared_at_ns.0 / 1_000_000_000
            && proof.timestamp.0 <= env::block_timestamp() / 1_000_000_000,
        "stale or future attestation"
    );
    require!(
        output_data.len() <= MAX_OUTPUT && raw_hash(output_data.as_bytes()) == proof.output_hash,
        "attested output mismatch"
    );
    let stdout: String =
        near_sdk::serde_json::from_str(output_data).expect("JSON encoded Text output required");
    // Guest emits compact canonical JSON with one trailing newline.
    require!(stdout.ends_with('\n'), "guest newline required");
    let outer = parse_canonical(&stdout[..stdout.len() - 1], MAX_OUTPUT);
    exact(&outer, &["outputHash", "result"]);
    let r = &outer["result"];
    exact(
        r,
        &[
            "schemaVersion",
            "execution",
            "requestId",
            "inputHash",
            "codeHash",
            "verification",
            "attested",
            "settlementAuthorized",
        ],
    );
    require!(
        field(&outer, "outputHash") == digest(canonical(r).as_bytes()),
        "judge result hash mismatch"
    );
    require!(
        r["schemaVersion"] == "1"
            && r["execution"] == "local-wasi-not-attested"
            && r["attested"] == false
            && r["settlementAuthorized"] == false,
        "unsupported judge output"
    );
    require!(
        field(r, "requestId") == pending.request_id
            && field(r, "inputHash") == pending.inner_hash
            && field(r, "codeHash") == format!("sha256:{CODE}"),
        "judge request context mismatch"
    );
    let v = &r["verification"];
    exact(
        v,
        &[
            "decision",
            "checks",
            "orderId",
            "taskId",
            "agreementHash",
            "policyHash",
            "sourceManifestHash",
            "artifactHash",
            "artifactVersion",
        ],
    );
    require!(
        field(v, "taskId") == pending.task_id
            && field(v, "agreementHash") == order.agreement_hash
            && field(v, "artifactHash") == pending.artifact_hash
            && field(v, "policyHash") == pending.policy_hash
            && v["artifactVersion"].as_u64() == Some(pending.revision + 1),
        "judge task context mismatch"
    );
    require!(
        state::hash(field(v, "artifactHash")),
        "invalid artifact hash"
    );
    v.clone()
}
