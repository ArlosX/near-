use crate::state::{self, Order, Task, Verdict, Wallet};
use crate::tee;
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{Value, json};
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, env, near, require,
};

const MAX_ORDERS: u64 = 64;
// Measured release code is ~1.303 MB. Keep ~73 KB code/state headroom plus
// a separate per-order envelope; actual usage and principal checks still fail closed.
const BASE_STORAGE: u64 = 1376256;
const PER_ORDER_STORAGE: u64 = 16384;
// Separate versioned key preserves the serialized Escrow layout on upgrade.
const ADMISSION_KEY: &[u8] = b"work-escrow:admitted-clients:v1";
fn must<T>(value: state::Result<T>) -> T {
    value.unwrap_or_else(|e| env::panic_str(e))
}
fn event(name: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"work_escrow","version":"1.0.0","event":name,"data":[data]})
    ));
}
#[derive(Deserialize, Serialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct TaskInput {
    pub id: String,
    pub recipient: AccountId,
    pub amount: U128,
    pub depends_on: Vec<String>,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Escrow {
    orders: LookupMap<String, Order>,
    wallets: LookupMap<String, Wallet>,
    order_count: u64,
    nonce: u64,
    escrow: u128,
    credits: u128,
    pending: u128,
    funded: u128,
    paid: u128,
    refunded: u128,
}
#[near]
impl Escrow {
    #[init]
    #[private]
    #[payable]
    pub fn new() -> Self {
        let this = Self {
            orders: LookupMap::new(b"o"),
            wallets: LookupMap::new(b"w"),
            order_count: 0,
            nonce: 0,
            escrow: 0,
            credits: 0,
            pending: 0,
            funded: 0,
            paid: 0,
            refunded: 0,
        };
        this.check_storage();
        this
    }
    #[payable]
    pub fn fund_storage(&mut self) {
        require!(
            env::attached_deposit().as_yoctonear() > 0,
            "positive donation required"
        );
        self.check_storage();
    }
    /// This operator-funded, 64-order MVP is an admitted-client deployment.
    /// Admission never grants authority over an existing order or its funds.
    #[private]
    pub fn set_client_admission(&mut self, client: AccountId, allowed: bool) {
        let mut clients = self.admitted_clients();
        clients.retain(|id| id != &client);
        if allowed {
            require!(clients.len() < 64, "client admission capacity reached");
            clients.push(client.clone());
        }
        env::storage_write(
            ADMISSION_KEY,
            &near_sdk::serde_json::to_vec(&clients).expect("admission serialization failed"),
        );
        self.check_storage();
        event(
            "client_admission",
            json!({"client":client,"allowed":allowed}),
        );
    }
    pub fn is_client_admitted(&self, client: AccountId) -> bool {
        client == env::current_account_id() || self.admitted_clients().contains(&client)
    }
    #[payable]
    pub fn create_work_order(
        &mut self,
        order_id: String,
        agreement_hash: String,
        verifier: AccountId,
        cutoff_ns: U64,
        tasks: Vec<TaskInput>,
    ) {
        require!(
            self.is_client_admitted(env::predecessor_account_id()),
            "client admission required for operator-funded MVP"
        );
        require!(state::id(&order_id), "invalid order id");
        require!(self.order_count < MAX_ORDERS, "order capacity reached");
        require!(self.orders.get(&order_id).is_none(), "duplicate order");
        require!(
            verifier != env::current_account_id(),
            "contract cannot be verifier"
        );
        let inputs = tasks
            .into_iter()
            .map(|t| {
                require!(
                    t.recipient != env::current_account_id(),
                    "contract cannot be payment recipient"
                );
                Task {
                    id: t.id,
                    recipient: t.recipient.to_string(),
                    amount: t.amount.0,
                    depends_on: t.depends_on,
                    result: None,
                }
            })
            .collect();
        let deposit = env::attached_deposit().as_yoctonear();
        let order = must(Order::new(
            env::predecessor_account_id().to_string(),
            verifier.to_string(),
            agreement_hash,
            cutoff_ns.0,
            env::block_timestamp(),
            deposit,
            inputs,
        ));
        for task in &order.tasks {
            if self.wallets.get(&task.recipient).is_none() {
                self.wallets.insert(&task.recipient, &Wallet::default());
            }
        }
        self.orders.insert(&order_id, &order);
        self.order_count += 1;
        self.escrow = must(state::add(self.escrow, deposit));
        self.funded = must(state::add(self.funded, deposit));
        self.check_storage();
        self.check_accounting();
        event(
            "order_funded",
            json!({"order_id":order_id,"agreement_hash":order.agreement_hash,"amount":U128(deposit)}),
        );
    }
    pub fn record_subtask_result(
        &mut self,
        order_id: String,
        task_id: String,
        accepted: bool,
        report_hash: String,
        artifact_hash: String,
    ) {
        require!(
            tee::load(&order_id).is_none(),
            "TEE mode: designated verifier cannot record results"
        );
        let mut order = self.order(&order_id);
        must(order.record(
            env::predecessor_account_id().as_str(),
            &task_id,
            Verdict {
                accepted,
                report_hash: report_hash.clone(),
                artifact_hash: artifact_hash.clone(),
            },
            env::block_timestamp(),
        ));
        self.orders.insert(&order_id, &order);
        self.check_storage();
        event(
            "task_final_result",
            json!({"order_id":order_id,"task_id":task_id,"accepted":accepted,"report_hash":report_hash,"artifact_hash":artifact_hash}),
        );
    }
    /// Funds a distinct, immutable verification profile. No setter or downgrade path.
    #[payable]
    pub fn create_tee_work_order(&mut self, agreement_json: String) {
        let a = tee::parse_canonical(&agreement_json, 8192);
        tee::exact(
            &a,
            &[
                "schemaVersion",
                "network",
                "contractId",
                "orderId",
                "clientAccountId",
                "verifierAccountId",
                "asset",
                "totalAmountAtomic",
                "resultCutoffNs",
                "sourceManifestHash",
                "settlement",
                "failure",
                "tasks",
            ],
        );
        require!(
            a["schemaVersion"] == "1.2"
                && a["network"] == "testnet"
                && a["asset"] == "NEAR"
                && a["settlement"] == "full_parent_success"
                && a["failure"] == "full_client_refund",
            "unsupported TEE economic profile"
        );
        require!(
            tee::field(&a, "contractId") == env::current_account_id().as_str(),
            "wrong agreement contract"
        );
        require!(
            tee::field(&a, "clientAccountId") == env::predecessor_account_id().as_str(),
            "wrong agreement client"
        );
        require!(
            state::hash(tee::field(&a, "sourceManifestHash")),
            "invalid source commitment"
        );
        let order_id = tee::field(&a, "orderId").to_string();
        let verifier: AccountId = tee::field(&a, "verifierAccountId")
            .parse()
            .expect("invalid verifier account");
        let cutoff = tee::field(&a, "resultCutoffNs")
            .parse::<u64>()
            .expect("invalid cutoff");
        require!(
            tee::field(&a, "resultCutoffNs") == cutoff.to_string(),
            "noncanonical agreement cutoff"
        );
        require!(
            cutoff < tee::PROFILE_VALID_UNTIL_NS,
            "TEE cutoff exceeds pinned collateral window"
        );
        require!(
            tee::field(&a, "totalAmountAtomic")
                == env::attached_deposit().as_yoctonear().to_string(),
            "agreement principal mismatch"
        );
        let tasks = a["tasks"].as_array().expect("tasks required");
        require!((2..=5).contains(&tasks.len()), "task count must be 2-5");
        let inputs = tasks
            .iter()
            .map(|t| {
                tee::exact(
                    t,
                    &[
                        "id",
                        "agentId",
                        "runtimeVersion",
                        "recipientAccountId",
                        "amountAtomic",
                        "dependsOn",
                        "criteria",
                        "verificationPolicyHash",
                        "maxRevisions",
                        "required",
                    ],
                );
                require!(
                    t["required"] == true && t["maxRevisions"].as_u64().is_some_and(|v| v <= 3),
                    "unsupported TEE task policy"
                );
                require!(
                    state::hash(tee::field(t, "verificationPolicyHash")),
                    "invalid frozen policy hash"
                );
                require!(
                    state::id(tee::field(t, "agentId"))
                        && state::id(tee::field(t, "runtimeVersion")),
                    "invalid agent identity"
                );
                let amount = tee::field(t, "amountAtomic")
                    .parse::<u128>()
                    .expect("invalid allocation");
                require!(
                    tee::field(t, "amountAtomic") == amount.to_string(),
                    "noncanonical agreement allocation"
                );
                TaskInput {
                    id: tee::field(t, "id").to_string(),
                    recipient: tee::field(t, "recipientAccountId")
                        .parse()
                        .expect("invalid recipient"),
                    amount: U128(amount),
                    depends_on: t["dependsOn"]
                        .as_array()
                        .expect("dependencies required")
                        .iter()
                        .map(|v| v.as_str().expect("dependency id required").to_string())
                        .collect(),
                }
            })
            .collect();
        let frozen = tee::Frozen {
            profile: tee::PROFILE.to_string(),
            agreement_json: agreement_json.clone(),
            progress: tasks
                .iter()
                .map(|t| tee::TaskProgress {
                    task_id: tee::field(t, "id").to_string(),
                    revision: 0,
                    pending: None,
                })
                .collect(),
        };
        self.create_work_order(
            order_id.clone(),
            tee::digest(agreement_json.as_bytes()),
            verifier,
            U64(cutoff),
            inputs,
        );
        tee::save(&order_id, &frozen);
        self.check_storage();
        event(
            "tee_profile_frozen",
            json!({"order_id":order_id,"profile":tee::PROFILE,"code_hash":tee::CODE,"collateral_hash":tee::COLLATERAL,"worker_measurements_hash":tee::MEASUREMENTS}),
        );
    }
    /// The verifier may supply work; it may never supply an acceptance decision.
    /// Timestamp and request identity are generated here, not by the model or relay.
    pub fn prepare_tee_request(
        &mut self,
        order_id: String,
        task_id: String,
        verification_json: String,
    ) -> Value {
        let order = self.order(&order_id);
        tee::open(&order);
        require!(
            env::predecessor_account_id().as_str() == order.verifier,
            "verifier only"
        );
        let task = order
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .expect("unknown task");
        require!(task.result.is_none(), "duplicate final result");
        let mut frozen = tee::load(&order_id).expect("TEE mode required");
        let a = tee::parse_canonical(&frozen.agreement_json, 8192);
        let policy_task = a["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == task_id)
            .unwrap();
        let progress = frozen
            .progress
            .iter_mut()
            .find(|t| t.task_id == task_id)
            .unwrap();
        require!(progress.pending.is_none(), "TEE request already pending");
        let mut verification = tee::parse_canonical(&verification_json, tee::MAX_INPUT);
        tee::exact(
            &verification,
            &[
                "agreement",
                "approvedAgreementHash",
                "taskId",
                "policy",
                "sources",
                "artifactBytes",
                "revision",
                "evaluatedAtNs",
                "acceptedDependencies",
            ],
        );
        require!(
            tee::canonical(&verification["agreement"]) == frozen.agreement_json
                && tee::field(&verification, "approvedAgreementHash") == order.agreement_hash
                && verification["taskId"] == task_id,
            "verification agreement or task mismatch"
        );
        let policy_hash = tee::digest(tee::canonical(&verification["policy"]).as_bytes());
        require!(
            policy_hash == tee::field(policy_task, "verificationPolicyHash"),
            "frozen policy mismatch"
        );
        require!(
            tee::digest(tee::canonical(&verification["sources"]).as_bytes())
                == tee::field(&a, "sourceManifestHash"),
            "frozen sources mismatch"
        );
        require!(
            verification["revision"].as_u64() == Some(progress.revision)
                && progress.revision <= policy_task["maxRevisions"].as_u64().unwrap(),
            "stale artifact revision"
        );
        tee::dependencies(&order, &task_id, &verification["acceptedDependencies"]);
        for dep in verification["acceptedDependencies"].as_array().unwrap() {
            require!(
                dep["orderId"] == order_id
                    && tee::field(dep, "agreementHash") == order.agreement_hash,
                "cross-order dependency"
            );
        }
        let artifact_hash = tee::digest(tee::field(&verification, "artifactBytes").as_bytes());
        let prepared_at_ns = env::block_timestamp();
        verification["evaluatedAtNs"] = json!(prepared_at_ns.to_string());
        let request_id = format!("tee-{}", self.next_operation());
        let inner = tee::canonical(
            &json!({"schemaVersion":"1","requestId":request_id,"codeHash":format!("sha256:{}",tee::CODE),"verification":verification}),
        );
        let inner_hash = tee::digest(inner.as_bytes());
        let input_data = tee::canonical(
            &json!({"inputBytes":inner,"expectedInputHash":inner_hash,"expectedCodeHash":format!("sha256:{}",tee::CODE)}),
        );
        require!(
            input_data.len() <= tee::MAX_INPUT,
            "TEE wrapped input too large"
        );
        let pending = tee::Pending {
            task_id: task_id.clone(),
            request_id: request_id.clone(),
            revision: progress.revision,
            artifact_hash,
            policy_hash,
            inner_hash,
            input_hash: tee::raw_hash(input_data.as_bytes()),
            prepared_at_ns: U64(prepared_at_ns),
        };
        progress.pending = Some(pending.clone());
        tee::save(&order_id, &frozen);
        self.check_storage();
        event(
            "tee_request_prepared",
            json!({"order_id":order_id,"pending":pending}),
        );
        json!({"profile":tee::PROFILE,"order_id":order_id,"request_id":request_id,"input_data":input_data,"wasm_hash":tee::CODE,"build_target":"wasm32-wasip2","response_format":"Text"})
    }
    /// Permissionless transport of proof bytes. Neither caller, old verifier,
    /// coordinator nor a callback can substitute a verdict for an Intel signature.
    pub fn submit_tee_result(
        &mut self,
        order_id: String,
        task_id: String,
        proof: tee::Proof,
        collateral: String,
        output_data: String,
    ) -> String {
        let mut order = self.order(&order_id);
        tee::open(&order);
        let mut frozen = tee::load(&order_id).expect("TEE mode required");
        let a = tee::parse_canonical(&frozen.agreement_json, 8192);
        let progress = frozen
            .progress
            .iter_mut()
            .find(|t| t.task_id == task_id)
            .expect("unknown task");
        let pending = progress
            .pending
            .as_ref()
            .expect("no pending TEE request")
            .clone();
        let v = tee::validate_proof(&proof, &pending, &order, &output_data);
        require!(
            v["orderId"] == order_id && v["sourceManifestHash"] == a["sourceManifestHash"],
            "judge order or sources mismatch"
        );
        let decision = tee::field(&v, "decision").to_string();
        require!(
            ["accepted", "revision_required", "rejected"].contains(&decision.as_str()),
            "unsupported judge decision"
        );
        let checks = v["checks"].as_array().expect("judge checks required");
        require!(
            !checks.is_empty() && checks.len() <= 128,
            "judge check bounds"
        );
        let all = checks.iter().all(|c| c["passed"] == true);
        require!(
            (decision == "accepted") == all,
            "inconsistent judge decision"
        );
        let max_revisions = a["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == task_id)
            .unwrap()["maxRevisions"]
            .as_u64()
            .unwrap();
        require!(
            decision != "revision_required" || pending.revision < max_revisions,
            "revision budget exhausted"
        );
        require!(
            decision != "rejected" || pending.revision == max_revisions,
            "premature final rejection"
        );
        tee::verify_crypto(&proof, &collateral, tee::MEASUREMENTS);
        // Consume only after every context and cryptographic check passed.
        progress.pending = None;
        if decision == "revision_required" {
            progress.revision += 1;
        } else {
            let verifier = order.verifier.clone();
            must(order.record(
                &verifier,
                &task_id,
                Verdict {
                    accepted: decision == "accepted",
                    report_hash: tee::digest(tee::canonical(&v).as_bytes()),
                    artifact_hash: pending.artifact_hash.clone(),
                },
                env::block_timestamp(),
            ));
            self.orders.insert(&order_id, &order);
        }
        tee::save(&order_id, &frozen);
        self.check_storage();
        self.check_accounting();
        event(
            "tee_result_verified",
            json!({"order_id":order_id,"task_id":task_id,"request_id":pending.request_id,"decision":decision,"attestation_task_id":proof.task_id,"quote_hash":tee::digest(&proof.quote.0),"output_hash":proof.output_hash}),
        );
        decision
    }
    pub fn get_tee_state(&self, order_id: String) -> Value {
        let _ = self.order(&order_id);
        match tee::load(&order_id) {
            Some(frozen) => {
                json!({"verification_mode":tee::PROFILE,"code_hash":tee::CODE,"collateral_hash":tee::COLLATERAL,"worker_measurements_hash":tee::MEASUREMENTS,"state":frozen})
            }
            None => json!({"verification_mode":"designated-verifier"}),
        }
    }
    pub fn finalize_success(&mut self, order_id: String) {
        let mut order = self.order(&order_id);
        let allocations = must(order.finalize());
        for (recipient, amount) in allocations {
            let mut wallet = self.wallets.get(&recipient).unwrap_or_default();
            must(wallet.credit(amount));
            self.wallets.insert(&recipient, &wallet);
        }
        self.escrow = self
            .escrow
            .checked_sub(order.principal)
            .expect("escrow accounting underflow");
        self.credits = must(state::add(self.credits, order.principal));
        self.orders.insert(&order_id, &order);
        self.check_storage();
        self.check_accounting();
        event(
            "success_credited",
            json!({"order_id":order_id,"amount":U128(order.principal)}),
        );
    }
    pub fn mark_expired(&mut self, order_id: String) {
        let mut order = self.order(&order_id);
        must(order.expire(env::block_timestamp()));
        self.orders.insert(&order_id, &order);
        event("order_expired", json!({"order_id":order_id}));
    }
    pub fn withdraw_claimable(&mut self) -> Promise {
        self.check_gas();
        let recipient = env::predecessor_account_id();
        let key = recipient.to_string();
        let mut wallet = self.wallets.get(&key).unwrap_or_default();
        let operation = self.next_operation();
        let transfer = must(wallet.reserve(operation));
        self.credits = self
            .credits
            .checked_sub(transfer.amount)
            .expect("credit underflow");
        self.pending = must(state::add(self.pending, transfer.amount));
        self.wallets.insert(&key, &wallet);
        self.check_storage();
        self.check_accounting();
        event(
            "withdrawal_pending",
            json!({"recipient":recipient,"operation":U64(operation),"amount":U128(transfer.amount)}),
        );
        Promise::new(recipient.clone())
            .transfer(NearToken::from_yoctonear(transfer.amount))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_withdrawal",
                    json!({"recipient":recipient,"operation":U64(operation)})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(20),
                ),
            )
    }
    pub fn claim_refund(&mut self, order_id: String) -> Promise {
        self.check_gas();
        let mut order = self.order(&order_id);
        let operation = self.next_operation();
        let transfer =
            must(order.reserve_refund(env::predecessor_account_id().as_str(), operation));
        let recipient: AccountId = order.client.parse().expect("stored client account invalid");
        self.escrow = self
            .escrow
            .checked_sub(transfer.amount)
            .expect("escrow underflow");
        self.pending = must(state::add(self.pending, transfer.amount));
        self.orders.insert(&order_id, &order);
        self.check_storage();
        self.check_accounting();
        event(
            "refund_pending",
            json!({"order_id":order_id,"operation":U64(operation),"amount":U128(transfer.amount)}),
        );
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(transfer.amount))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_refund",
                    json!({"order_id":order_id,"operation":U64(operation)})
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(20),
                ),
            )
    }
    #[private]
    pub fn on_withdrawal(&mut self, recipient: AccountId, operation: U64) -> bool {
        let success = Self::transfer_succeeded();
        let key = recipient.to_string();
        let mut wallet = self.wallets.get(&key).expect("wallet missing");
        let amount = must(wallet.finish(operation.0, success));
        self.pending = self.pending.checked_sub(amount).expect("pending underflow");
        if success {
            self.paid = must(state::add(self.paid, amount));
        } else {
            self.credits = must(state::add(self.credits, amount));
        }
        self.wallets.insert(&key, &wallet);
        self.check_accounting();
        event(
            "withdrawal_resolved",
            json!({"recipient":recipient,"operation":operation,"success":success,"amount":U128(amount)}),
        );
        success
    }
    #[private]
    pub fn on_refund(&mut self, order_id: String, operation: U64) -> bool {
        let success = Self::transfer_succeeded();
        let mut order = self.order(&order_id);
        let amount = must(order.finish_refund(operation.0, success));
        self.pending = self.pending.checked_sub(amount).expect("pending underflow");
        if success {
            self.refunded = must(state::add(self.refunded, amount));
        } else {
            self.escrow = must(state::add(self.escrow, amount));
        }
        self.orders.insert(&order_id, &order);
        self.check_accounting();
        event(
            "refund_resolved",
            json!({"order_id":order_id,"operation":operation,"success":success,"amount":U128(amount)}),
        );
        success
    }
    pub fn get_order(&self, order_id: String) -> Value {
        let o = self.order(&order_id);
        json!({"order_id":order_id,"client":o.client,"verifier":o.verifier,"agreement_hash":o.agreement_hash,"cutoff_ns":U64(o.cutoff),"principal":U128(o.principal),"status":format!("{:?}",o.status),"refunded":o.refunded,"refund_pending":o.refund_pending.map(|p|json!({"operation":U64(p.operation),"amount":U128(p.amount)})),"tasks":o.tasks.iter().map(|t|json!({"id":t.id,"recipient":t.recipient,"amount":U128(t.amount),"depends_on":t.depends_on,"result":t.result.as_ref().map(|r|json!({"accepted":r.accepted,"report_hash":r.report_hash,"artifact_hash":r.artifact_hash}))})).collect::<Vec<_>>()})
    }
    pub fn get_balance(&self, account: AccountId) -> Value {
        let w = self.wallets.get(&account.to_string()).unwrap_or_default();
        json!({"available":U128(w.available),"pending":w.pending.map(|p|json!({"operation":U64(p.operation),"amount":U128(p.amount)}))})
    }
    pub fn get_accounting(&self) -> Value {
        json!({"funded":U128(self.funded),"escrow":U128(self.escrow),"available_credits":U128(self.credits),"pending_transfers":U128(self.pending),"paid":U128(self.paid),"refunded":U128(self.refunded),"order_count":U64(self.order_count),"max_orders":U64(MAX_ORDERS),"reserved_storage_bytes":U64(BASE_STORAGE+self.order_count*PER_ORDER_STORAGE)})
    }
}
impl Escrow {
    fn admitted_clients(&self) -> Vec<AccountId> {
        env::storage_read(ADMISSION_KEY)
            .map(|bytes| near_sdk::serde_json::from_slice(&bytes).expect("invalid admission state"))
            .unwrap_or_default()
    }
    fn order(&self, id: &String) -> Order {
        self.orders
            .get(id)
            .unwrap_or_else(|| env::panic_str("unknown order"))
    }
    fn next_operation(&mut self) -> u64 {
        self.nonce = self.nonce.checked_add(1).expect("operation overflow");
        self.nonce
    }
    fn transfer_succeeded() -> bool {
        require!(
            env::promise_results_count() == 1,
            "one transfer promise required"
        );
        match env::promise_result_checked(0, 0) {
            Ok(_) => true,
            Err(PromiseError::Failed) => false,
            Err(_) => env::panic_str("unexpected native transfer result"),
        }
    }
    fn check_gas(&self) {
        require!(
            env::prepaid_gas()
                .as_gas()
                .saturating_sub(env::used_gas().as_gas())
                >= Gas::from_tgas(45).as_gas(),
            "at least 45 Tgas remaining required"
        );
    }
    fn check_storage(&self) {
        let reserved = BASE_STORAGE + self.order_count * PER_ORDER_STORAGE;
        require!(
            env::storage_usage().saturating_add(4096) <= reserved,
            "storage envelope exceeded"
        );
        let locked = env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(reserved as u128)
            .expect("storage cost overflow");
        let active = must(state::add(self.escrow, self.credits));
        let required = must(state::add(active, locked));
        // Conservative while a transfer is pending: do not spend balance potentially committed to it.
        require!(
            env::account_balance()
                .as_yoctonear()
                .saturating_sub(self.pending)
                >= required,
            "operator storage/liquidity reserve insufficient"
        );
    }
    fn check_accounting(&self) {
        let outstanding = must(state::add(
            must(state::add(self.escrow, self.credits)),
            self.pending,
        ));
        let settled = must(state::add(self.paid, self.refunded));
        require!(
            must(state::add(outstanding, settled)) == self.funded,
            "principal conservation violated"
        );
    }
}
