//! Deterministic local state-machine challenges; no RPC, keys or deployment.
use work_escrow::state::{Order, Status, Task, Verdict, Wallet};

fn hash() -> String {
    format!("sha256:{}", "a".repeat(64))
}
fn next(seed: &mut u64) -> u64 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    *seed
}
fn order() -> Order {
    Order::new(
        "buyer".into(),
        "judge".into(),
        hash(),
        100,
        1,
        100,
        vec![
            Task {
                id: "a".into(),
                recipient: "worker".into(),
                amount: 40,
                depends_on: vec![],
                result: None,
            },
            Task {
                id: "b".into(),
                recipient: "worker".into(),
                amount: 60,
                depends_on: vec!["a".into()],
                result: None,
            },
        ],
    )
    .unwrap()
}

#[test]
fn ten_thousand_wallet_interleavings_conserve_value_and_reject_callback_replay() {
    let mut seed = 0x50524f4f464c414e;
    let mut wallet = Wallet::default();
    let (mut credited, mut paid, mut operation) = (0u128, 0u128, 0u64);
    for _ in 0..10_000 {
        let before = wallet.clone();
        let action = next(&mut seed) % 5;
        let result = match action {
            0 => {
                let amount = u128::from(next(&mut seed) % 1000 + 1);
                let r = wallet.credit(amount);
                if r.is_ok() {
                    credited += amount;
                }
                r.map(|_| 0)
            }
            1 => {
                operation += 1;
                wallet.reserve(operation).map(|_| 0)
            }
            2 | 3 => {
                let op = wallet
                    .pending
                    .as_ref()
                    .map(|t| t.operation)
                    .unwrap_or(operation);
                let success = action == 2;
                let r = wallet.finish(op, success);
                if let Ok(amount) = r {
                    if success {
                        paid += amount;
                    }
                }
                r
            }
            _ => wallet.finish(operation + 1, true),
        };
        if result.is_err() {
            assert_eq!(wallet, before, "failed transition mutated state");
        }
        let pending = wallet.pending.as_ref().map(|t| t.amount).unwrap_or(0);
        assert_eq!(credited, wallet.available + pending + paid);
    }
}

#[test]
fn randomized_order_sequences_never_pay_and_refund_the_same_principal() {
    let mut seed = 0x544545;
    for _ in 0..200 {
        let mut o = order();
        let mut allocated = 0;
        let mut refunded = 0;
        let mut op = 0;
        for _ in 0..100 {
            let before = o.clone();
            let r = match next(&mut seed) % 8 {
                0 | 1 | 2 => {
                    let caller = if next(&mut seed) % 3 == 0 {
                        "attacker"
                    } else {
                        "judge"
                    };
                    let task = if next(&mut seed) % 2 == 0 { "a" } else { "b" };
                    let now = if next(&mut seed) % 4 == 0 { 100 } else { 99 };
                    o.record(
                        caller,
                        task,
                        Verdict {
                            accepted: next(&mut seed) % 4 != 0,
                            report_hash: hash(),
                            artifact_hash: hash(),
                        },
                        now,
                    )
                }
                3 => o.finalize().map(|credits| {
                    allocated += credits.iter().map(|(_, v)| v).sum::<u128>();
                }),
                4 => o.expire(100),
                5 => {
                    op += 1;
                    o.reserve_refund("buyer", op).map(|_| ())
                }
                6 => {
                    let success = next(&mut seed) % 2 == 0;
                    o.finish_refund(op, success).map(|amount| {
                        if success {
                            refunded += amount;
                        }
                    })
                }
                _ => o.finish_refund(op + 1, true).map(|_| ()),
            };
            if r.is_err() {
                assert_eq!(o, before, "rejected operation changed order");
            }
            assert!(allocated + refunded <= 100);
            if allocated > 0 {
                assert_eq!(o.status, Status::SuccessCredited);
                assert!(o.all_accepted());
                assert!(!o.refunded);
            }
            if o.tasks[1].result.is_some() {
                assert!(o.tasks[0].result.as_ref().unwrap().accepted);
            }
        }
    }
}
