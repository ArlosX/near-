//! Financial transitions shared by the Wasm contract and native Rust tests.
//! No network calls, balances inferred from promises, or model-owned authority.

pub type Result<T> = std::result::Result<T, &'static str>;
fn check(ok: bool, message: &'static str) -> Result<()> {
    if ok { Ok(()) } else { Err(message) }
}
pub fn add(a: u128, b: u128) -> Result<u128> {
    a.checked_add(b).ok_or("amount overflow")
}
pub fn id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
pub fn hash(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    Failed,
    Expired,
    SuccessCredited,
}
#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Verdict {
    pub accepted: bool,
    pub report_hash: String,
    pub artifact_hash: String,
}
#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub recipient: String,
    pub amount: u128,
    pub depends_on: Vec<String>,
    pub result: Option<Verdict>,
}
#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transfer {
    pub operation: u64,
    pub amount: u128,
}
#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Wallet {
    pub available: u128,
    pub pending: Option<Transfer>,
}
#[cfg_attr(
    target_arch = "wasm32",
    derive(near_sdk::borsh::BorshSerialize, near_sdk::borsh::BorshDeserialize)
)]
#[cfg_attr(target_arch = "wasm32", borsh(crate = "near_sdk::borsh"))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Order {
    pub client: String,
    pub verifier: String,
    pub agreement_hash: String,
    pub cutoff: u64,
    pub principal: u128,
    pub tasks: Vec<Task>,
    pub status: Status,
    pub refund_pending: Option<Transfer>,
    pub refunded: bool,
}
impl Order {
    pub fn new(
        client: String,
        verifier: String,
        agreement_hash: String,
        cutoff: u64,
        now: u64,
        deposit: u128,
        tasks: Vec<Task>,
    ) -> Result<Self> {
        check(hash(&agreement_hash), "invalid agreement hash")?;
        check(cutoff > now, "cutoff must be future")?;
        check(
            cutoff - now <= 7 * 24 * 3600 * 1_000_000_000,
            "cutoff exceeds seven-day cap",
        )?;
        check((2..=5).contains(&tasks.len()), "task count must be 2-5")?;
        let mut sum = 0u128;
        let mut edges = 0usize;
        for (index, t) in tasks.iter().enumerate() {
            check(id(&t.id), "invalid task id")?;
            check(t.amount > 0, "positive allocation required")?;
            check(t.result.is_none(), "initial result forbidden")?;
            check(
                !tasks[..index].iter().any(|p| p.id == t.id),
                "duplicate task",
            )?;
            check(t.depends_on.len() < tasks.len(), "too many dependencies")?;
            for (i, dep) in t.depends_on.iter().enumerate() {
                check(
                    dep != &t.id && tasks.iter().any(|p| &p.id == dep),
                    "invalid dependency",
                )?;
                check(!t.depends_on[..i].contains(dep), "duplicate dependency")?;
            }
            edges += t.depends_on.len();
            sum = add(sum, t.amount)?;
        }
        check(edges > 0, "dependency required")?;
        fn visit(index: usize, tasks: &[Task], marks: &mut [u8]) -> Result<()> {
            check(marks[index] != 1, "dependency cycle")?;
            if marks[index] == 2 {
                return Ok(());
            }
            marks[index] = 1;
            for dep in &tasks[index].depends_on {
                visit(
                    tasks
                        .iter()
                        .position(|t| &t.id == dep)
                        .ok_or("unknown dependency")?,
                    tasks,
                    marks,
                )?;
            }
            marks[index] = 2;
            Ok(())
        }
        let mut marks = vec![0u8; tasks.len()];
        for i in 0..tasks.len() {
            visit(i, &tasks, &mut marks)?;
        }
        check(deposit == sum, "deposit must equal allocation sum")?;
        Ok(Self {
            client,
            verifier,
            agreement_hash,
            cutoff,
            principal: sum,
            tasks,
            status: Status::Open,
            refund_pending: None,
            refunded: false,
        })
    }
    pub fn all_accepted(&self) -> bool {
        self.tasks
            .iter()
            .all(|t| t.result.as_ref().is_some_and(|r| r.accepted))
    }
    pub fn record(
        &mut self,
        caller: &str,
        task_id: &str,
        verdict: Verdict,
        now: u64,
    ) -> Result<()> {
        check(caller == self.verifier, "verifier only")?;
        check(self.status == Status::Open, "terminal order")?;
        check(now < self.cutoff, "result cutoff reached")?;
        check(
            hash(&verdict.report_hash) && hash(&verdict.artifact_hash),
            "invalid result hash",
        )?;
        let index = self
            .tasks
            .iter()
            .position(|t| t.id == task_id)
            .ok_or("unknown task")?;
        check(self.tasks[index].result.is_none(), "duplicate final result")?;
        for dep in &self.tasks[index].depends_on {
            check(
                self.tasks
                    .iter()
                    .find(|t| &t.id == dep)
                    .and_then(|t| t.result.as_ref())
                    .is_some_and(|r| r.accepted),
                "predecessor not accepted",
            )?;
        }
        if !verdict.accepted {
            self.status = Status::Failed;
        }
        self.tasks[index].result = Some(verdict);
        Ok(())
    }
    pub fn finalize(&mut self) -> Result<Vec<(String, u128)>> {
        check(self.status == Status::Open, "terminal order")?;
        check(self.all_accepted(), "required results missing")?;
        self.status = Status::SuccessCredited;
        Ok(self
            .tasks
            .iter()
            .map(|t| (t.recipient.clone(), t.amount))
            .collect())
    }
    pub fn expire(&mut self, now: u64) -> Result<()> {
        check(self.status == Status::Open, "terminal order")?;
        check(now >= self.cutoff, "not expired")?;
        check(!self.all_accepted(), "accepted order cannot expire")?;
        self.status = Status::Expired;
        Ok(())
    }
    pub fn reserve_refund(&mut self, caller: &str, operation: u64) -> Result<Transfer> {
        check(caller == self.client, "client only")?;
        check(
            self.status == Status::Failed || self.status == Status::Expired,
            "refund not eligible",
        )?;
        check(
            !self.refunded && self.refund_pending.is_none(),
            "refund already paid or pending",
        )?;
        let pending = Transfer {
            operation,
            amount: self.principal,
        };
        self.refund_pending = Some(pending.clone());
        Ok(pending)
    }
    pub fn finish_refund(&mut self, operation: u64, success: bool) -> Result<u128> {
        let pending = self.refund_pending.as_ref().ok_or("no pending refund")?;
        check(pending.operation == operation, "wrong refund operation")?;
        let amount = pending.amount;
        self.refund_pending = None;
        if success {
            self.refunded = true;
        }
        Ok(amount)
    }
}
impl Wallet {
    pub fn credit(&mut self, amount: u128) -> Result<()> {
        self.available = add(self.available, amount)?;
        Ok(())
    }
    pub fn reserve(&mut self, operation: u64) -> Result<Transfer> {
        check(self.pending.is_none(), "withdrawal already pending")?;
        check(self.available > 0, "no available credit")?;
        let pending = Transfer {
            operation,
            amount: self.available,
        };
        self.available = 0;
        self.pending = Some(pending.clone());
        Ok(pending)
    }
    pub fn finish(&mut self, operation: u64, success: bool) -> Result<u128> {
        let pending = self.pending.as_ref().ok_or("no pending withdrawal")?;
        check(pending.operation == operation, "wrong withdrawal operation")?;
        let amount = pending.amount;
        if !success {
            self.available = add(self.available, amount)?;
        }
        self.pending = None;
        Ok(amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn digest() -> String {
        format!("sha256:{}", "a".repeat(64))
    }
    fn tasks() -> Vec<Task> {
        vec![
            Task {
                id: "extract".into(),
                recipient: "worker.testnet".into(),
                amount: 40,
                depends_on: vec![],
                result: None,
            },
            Task {
                id: "compare".into(),
                recipient: "worker.testnet".into(),
                amount: 60,
                depends_on: vec!["extract".into()],
                result: None,
            },
        ]
    }
    fn order() -> Order {
        Order::new(
            "client.testnet".into(),
            "verify.testnet".into(),
            digest(),
            100,
            1,
            100,
            tasks(),
        )
        .unwrap()
    }
    fn verdict(accepted: bool) -> Verdict {
        Verdict {
            accepted,
            report_hash: digest(),
            artifact_hash: digest(),
        }
    }
    fn accepted() -> Order {
        let mut o = order();
        o.record("verify.testnet", "extract", verdict(true), 2)
            .unwrap();
        o.record("verify.testnet", "compare", verdict(true), 3)
            .unwrap();
        o
    }
    #[test]
    fn wrong_funding() {
        for amount in [0, 99, 101] {
            assert!(Order::new("c".into(), "v".into(), digest(), 100, 1, amount, tasks()).is_err());
        }
    }
    #[test]
    fn duplicate_task_and_cycle() {
        let mut t = tasks();
        t[1].id = "extract".into();
        assert!(Order::new("c".into(), "v".into(), digest(), 100, 1, 100, t).is_err());
        let mut t = tasks();
        t[0].depends_on = vec!["compare".into()];
        assert!(Order::new("c".into(), "v".into(), digest(), 100, 1, 100, t).is_err());
    }
    #[test]
    fn overflow_and_bad_hash() {
        assert!(add(u128::MAX, 1).is_err());
        assert!(!hash("sha256:x"));
        assert!(!hash(&format!("sha256:{}", "A".repeat(64))));
    }
    #[test]
    fn authorization_and_dependency() {
        let mut o = order();
        assert!(o.record("attacker", "extract", verdict(true), 2).is_err());
        assert!(
            o.record("verify.testnet", "compare", verdict(true), 2)
                .is_err()
        );
        assert!(
            o.record("verify.testnet", "unknown", verdict(true), 2)
                .is_err()
        );
        assert_eq!(o, order());
    }
    #[test]
    fn duplicate_verdict() {
        let mut o = order();
        o.record("verify.testnet", "extract", verdict(true), 2)
            .unwrap();
        assert!(
            o.record("verify.testnet", "extract", verdict(false), 3)
                .is_err()
        );
        assert_eq!(o.status, Status::Open);
    }
    #[test]
    fn exact_cutoff() {
        let mut o = order();
        assert!(
            o.record("verify.testnet", "extract", verdict(true), 100)
                .is_err()
        );
        o.record("verify.testnet", "extract", verdict(true), 99)
            .unwrap();
        assert!(
            o.record("verify.testnet", "compare", verdict(true), 100)
                .is_err()
        );
        o.expire(100).unwrap();
        assert!(o.finalize().is_err());
    }
    #[test]
    fn fully_accepted_can_finalize_late() {
        let mut o = accepted();
        assert!(o.expire(1000).is_err());
        let credits = o.finalize().unwrap();
        assert_eq!(credits.iter().map(|c| c.1).sum::<u128>(), 100);
        assert!(o.finalize().is_err());
        assert!(o.reserve_refund("client.testnet", 1).is_err());
    }
    #[test]
    fn final_failure_blocks_downstream_and_payout() {
        let mut o = order();
        o.record("verify.testnet", "extract", verdict(false), 2)
            .unwrap();
        assert!(
            o.record("verify.testnet", "compare", verdict(true), 3)
                .is_err()
        );
        assert!(o.finalize().is_err());
        assert!(o.reserve_refund("attacker", 1).is_err());
        assert_eq!(o.reserve_refund("client.testnet", 1).unwrap().amount, 100);
    }
    #[test]
    fn refund_failure_restores_and_success_is_terminal() {
        let mut o = order();
        o.expire(100).unwrap();
        o.reserve_refund("client.testnet", 1).unwrap();
        assert!(o.reserve_refund("client.testnet", 2).is_err());
        assert!(o.finish_refund(2, true).is_err());
        assert_eq!(o.finish_refund(1, false).unwrap(), 100);
        o.reserve_refund("client.testnet", 2).unwrap();
        o.finish_refund(2, true).unwrap();
        assert!(o.finish_refund(2, false).is_err());
        assert!(o.reserve_refund("client.testnet", 3).is_err());
    }
    #[test]
    fn withdrawal_new_credit_survives_failure() {
        let mut w = Wallet::default();
        w.credit(100).unwrap();
        w.reserve(1).unwrap();
        assert!(w.reserve(2).is_err());
        w.credit(25).unwrap();
        assert!(w.finish(2, true).is_err());
        w.finish(1, false).unwrap();
        assert_eq!(w.available, 125);
        assert!(w.finish(1, true).is_err());
    }
    #[test]
    fn withdrawal_new_credit_survives_success() {
        let mut w = Wallet::default();
        w.credit(100).unwrap();
        w.reserve(1).unwrap();
        w.credit(25).unwrap();
        assert_eq!(w.finish(1, true).unwrap(), 100);
        assert_eq!(w.available, 25);
        assert!(w.finish(1, false).is_err());
    }
    #[test]
    fn expiry_requires_cutoff_and_not_success() {
        let mut o = order();
        assert!(o.expire(99).is_err());
        o.expire(100).unwrap();
        assert!(
            o.record("verify.testnet", "extract", verdict(true), 100)
                .is_err()
        );
        assert!(o.expire(100).is_err());
    }
}
